-- Doorstar isolated named-user pilot: append-only admin roster policy.
--
-- This migration extends the reviewed A/P1 policy; it does not edit or replay
-- the immutable F/A lineage. It creates no PostgreSQL login, credential,
-- Keycloak client, invitation, deployment or external state.

-- PostgreSQL does not permit a newly-added enum label to be used before the
-- transaction that adds it commits. Keep this statement deliberately outside
-- the routine-definition transaction below.
ALTER TYPE pilot."BindingAuditAction" ADD VALUE 'DIRECT_ADMIN_PROVISION';

BEGIN;

-- Retain the existing append-only trigger and DB-owned actor checks while
-- adding the one direct-admin initial-binding transition. A direct provision
-- is a NULL-to-1 audit transition; update/revoke transitions remain n-to-n+1.
CREATE OR REPLACE FUNCTION pilot.doorstar_guard_binding_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
DECLARE
  v_scope_id uuid;
  v_target pilot."PrincipalBinding"%ROWTYPE;
  v_actor pilot."PrincipalBinding"%ROWTYPE;
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(NEW."source");

  IF NEW."pilotScopeId" IS DISTINCT FROM v_scope_id
     OR NEW."nextAuditVersion" <= 0
     OR NEW."correlationId" IS NULL
     OR NEW."witnessTransactionId" IS DISTINCT FROM pg_catalog.txid_current()
     OR (
       NEW."action" IN (
         'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction",
         'DIRECT_ADMIN_PROVISION'::pilot."BindingAuditAction"
       )
       AND (
         NEW."previousAuditVersion" IS NOT NULL
         OR NEW."nextAuditVersion" <> 1
         OR NEW."previousRole" IS NOT NULL
         OR NEW."previousActive" IS NOT NULL
         OR NEW."previousCanManagePilotRoster" IS NOT NULL
         OR NEW."nextActive" IS NOT TRUE
       )
     )
     OR (
       NEW."action" NOT IN (
         'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction",
         'DIRECT_ADMIN_PROVISION'::pilot."BindingAuditAction"
       )
       AND (
         NEW."previousAuditVersion" IS NULL
         OR NEW."nextAuditVersion" <> NEW."previousAuditVersion" + 1
         OR NEW."previousRole" IS NULL
         OR NEW."previousActive" IS NULL
         OR NEW."previousCanManagePilotRoster" IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'binding audit witness is not DB-owned for the current pilot scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT binding.*
    INTO v_target
    FROM pilot."PrincipalBinding" AS binding
    WHERE binding."id" = NEW."bindingId"
      AND binding."pilotScopeId" = v_scope_id
    FOR SHARE;

  IF NOT FOUND
     OR v_target."auditVersion" <> NEW."nextAuditVersion"
     OR NEW."nextRole" IS DISTINCT FROM v_target."role"
     OR NEW."nextActive" IS DISTINCT FROM v_target."active"
     OR NEW."nextCanManagePilotRoster" IS DISTINCT FROM v_target."canManagePilotRoster" THEN
    RAISE EXCEPTION 'binding audit does not witness the current protected binding state'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."source" = 'DIRECT_ADMIN'::pilot."BindingAuditSource" THEN
    IF NEW."action" NOT IN (
         'DIRECT_ADMIN_PROVISION'::pilot."BindingAuditAction",
         'DIRECT_ADMIN_UPDATE'::pilot."BindingAuditAction",
         'BINDING_DEACTIVATED'::pilot."BindingAuditAction",
         'BINDING_REACTIVATED'::pilot."BindingAuditAction"
       )
       OR NEW."actorBindingId" IS NULL
       OR NEW."actorBindingId" = NEW."bindingId"
       OR NEW."approvalReference" IS NOT NULL
       OR (
         NEW."action" = 'DIRECT_ADMIN_PROVISION'::pilot."BindingAuditAction"
         AND NEW."reason" IS DISTINCT FROM 'direct-admin-provision'
       ) THEN
      RAISE EXCEPTION 'direct roster changes require a distinct manager actor and reviewed audit action'
        USING ERRCODE = '42501';
    END IF;

    SELECT binding.*
      INTO v_actor
      FROM pilot."PrincipalBinding" AS binding
      WHERE binding."id" = NEW."actorBindingId"
        AND binding."pilotScopeId" = v_scope_id
      FOR SHARE;

    IF NOT FOUND OR NOT pilot.doorstar_is_effective_pilot_roster_manager(
      v_actor."active", v_actor."role", v_actor."canManagePilotRoster"
    ) THEN
      RAISE EXCEPTION 'direct roster changes require an effective manager actor'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW."source" = 'BOOTSTRAP_CLI'::pilot."BindingAuditSource" THEN
    IF NEW."action" NOT IN (
         'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction",
         'BINDING_DEACTIVATED'::pilot."BindingAuditAction"
       )
       OR NEW."actorBindingId" IS NOT NULL
       OR NEW."approvalReference" IS NULL
       OR btrim(NEW."approvalReference") = '' THEN
      RAISE EXCEPTION 'bootstrap audit requires a DB-owned actor boundary and approval reference'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported binding audit source'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Runtime direct provision. The prospective IdP identity is already reduced
-- to a server-derived subject digest before this function is called. The
-- caller supplies no scope, actor binding, audit source or audit version; the
-- actor is resolved solely from the live opaque-session token hash.
CREATE FUNCTION pilot.pilot_direct_provision_binding_v1(
  p_actor_session_token_hash text,
  p_issuer text,
  p_subject_digest text,
  p_new_actor_key text,
  p_display_name text,
  p_role pilot."PilotOfficeRole",
  p_can_manage_pilot_roster boolean,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
DECLARE
  v_scope_id uuid;
  v_actor pilot."PrincipalBinding"%ROWTYPE;
  v_binding_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  -- Follow the same lock order as the reviewed direct update and bootstrap
  -- mutators: scope lock before any actor/session row lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pilot.doorstar_pilot_roster_lock_key(v_scope_id)
  );

  IF p_actor_session_token_hash IS NULL
     OR p_actor_session_token_hash !~ '^[0-9a-f]{64}$'
     OR p_issuer IS NULL
     OR btrim(p_issuer) = ''
     OR btrim(p_issuer) <> p_issuer
     OR char_length(p_issuer) > 2048
     OR p_issuer !~ '^https://[^[:space:]]+$'
     OR p_subject_digest IS NULL
     OR p_subject_digest !~ '^[0-9a-f]{64}$'
     OR p_new_actor_key IS NULL
     OR p_new_actor_key !~ '^[0-9a-f]{64}$'
     OR p_display_name IS NULL
     OR btrim(p_display_name) = ''
     OR btrim(p_display_name) <> p_display_name
     OR char_length(p_display_name) > 160
     OR p_display_name ~ '[[:cntrl:]]'
     OR p_role IS NULL
     OR p_role = 'SHOP_FLOOR'::pilot."PilotOfficeRole"
     OR p_can_manage_pilot_roster IS NULL
     OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid direct roster provision arguments' USING ERRCODE = '22023';
  END IF;

  SELECT binding.*
    INTO v_actor
    FROM pilot."OpaqueSession" AS session_row
    JOIN pilot."PrincipalBinding" AS binding
      ON binding."id" = session_row."bindingId"
      AND binding."pilotScopeId" = session_row."pilotScopeId"
    WHERE session_row."pilotScopeId" = v_scope_id
      AND session_row."sessionTokenHash" = p_actor_session_token_hash
      AND session_row."revokedAt" IS NULL
      AND session_row."expiresAt" > CURRENT_TIMESTAMP
      AND session_row."bindingEpoch" = binding."auditVersion"
    FOR SHARE OF session_row, binding;

  IF NOT FOUND OR NOT pilot.doorstar_is_effective_pilot_roster_manager(
    v_actor."active", v_actor."role", v_actor."canManagePilotRoster"
  ) THEN
    RAISE EXCEPTION 'direct roster provision requires a live effective-manager session'
      USING ERRCODE = '42501';
  END IF;

  IF (v_actor."issuer" = p_issuer AND v_actor."subjectDigest" = p_subject_digest)
     OR v_actor."actorKey" = p_new_actor_key THEN
    RAISE EXCEPTION 'a roster manager cannot provision its own binding'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pilot."PrincipalBinding" AS binding
      WHERE binding."pilotScopeId" = v_scope_id
        AND (
          (binding."issuer" = p_issuer AND binding."subjectDigest" = p_subject_digest)
          OR binding."actorKey" = p_new_actor_key
        )
  ) THEN
    RAISE EXCEPTION 'direct roster provision cannot create a duplicate binding'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO pilot."PrincipalBinding" (
    "id", "pilotScopeId", "actorKey", "issuer", "subjectDigest", "displayName",
    "role", "active", "canManagePilotRoster", "auditVersion", "createdAt", "updatedAt"
  ) VALUES (
    v_binding_id, v_scope_id, p_new_actor_key, p_issuer, p_subject_digest, p_display_name,
    p_role, true, p_can_manage_pilot_roster, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO pilot."BindingAudit" (
    "id", "pilotScopeId", "bindingId", "actorBindingId", "action", "source",
    "previousRole", "nextRole", "previousActive", "nextActive",
    "previousCanManagePilotRoster", "nextCanManagePilotRoster", "reason",
    "approvalReference", "previousAuditVersion", "nextAuditVersion", "correlationId",
    "witnessTransactionId", "createdAt"
  ) VALUES (
    pg_catalog.gen_random_uuid(), v_scope_id, v_binding_id, v_actor."id",
    'DIRECT_ADMIN_PROVISION'::pilot."BindingAuditAction",
    'DIRECT_ADMIN'::pilot."BindingAuditSource",
    NULL, p_role, NULL, true, NULL, p_can_manage_pilot_roster,
    'direct-admin-provision', NULL, NULL, 1, p_correlation_id,
    pg_catalog.txid_current(), CURRENT_TIMESTAMP
  );

  PERFORM pilot.doorstar_require_effective_pilot_roster_manager(v_scope_id);
  RETURN v_binding_id;
END;
$$;

-- Manager-session guarded roster read. It returns only the fields required by
-- the same-origin BFF admin list/edit UI; issuer, subject digest, actor key,
-- session state and audit details stay inside the database boundary.
CREATE FUNCTION pilot.pilot_list_direct_admin_bindings_v1(
  p_actor_session_token_hash text
)
RETURNS TABLE (
  "bindingId" uuid,
  "displayName" text,
  "role" pilot."PilotOfficeRole",
  "active" boolean,
  "canManagePilotRoster" boolean,
  "auditVersion" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
DECLARE
  v_scope_id uuid;
  v_actor pilot."PrincipalBinding"%ROWTYPE;
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  IF p_actor_session_token_hash IS NULL
     OR p_actor_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid direct roster list arguments' USING ERRCODE = '22023';
  END IF;

  -- The list shares the mutators' scope lock so a manager cannot observe a
  -- roster after its own authority has been concurrently changed.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pilot.doorstar_pilot_roster_lock_key(v_scope_id)
  );

  SELECT binding.*
    INTO v_actor
    FROM pilot."OpaqueSession" AS session_row
    JOIN pilot."PrincipalBinding" AS binding
      ON binding."id" = session_row."bindingId"
      AND binding."pilotScopeId" = session_row."pilotScopeId"
    WHERE session_row."pilotScopeId" = v_scope_id
      AND session_row."sessionTokenHash" = p_actor_session_token_hash
      AND session_row."revokedAt" IS NULL
      AND session_row."expiresAt" > CURRENT_TIMESTAMP
      AND session_row."bindingEpoch" = binding."auditVersion"
    FOR SHARE OF session_row, binding;

  IF NOT FOUND OR NOT pilot.doorstar_is_effective_pilot_roster_manager(
    v_actor."active", v_actor."role", v_actor."canManagePilotRoster"
  ) THEN
    RAISE EXCEPTION 'direct roster list requires a live effective-manager session'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    binding."id",
    binding."displayName"::text,
    binding."role",
    binding."active",
    binding."canManagePilotRoster",
    binding."auditVersion"
  FROM pilot."PrincipalBinding" AS binding
  WHERE binding."pilotScopeId" = v_scope_id
  ORDER BY binding."displayName", binding."id";
END;
$$;

-- New functions would otherwise receive PostgreSQL's default PUBLIC execute
-- privilege. The later DBA operation may grant only these exact signatures to
-- the reviewed runtime login after its independent ACL proof.
REVOKE ALL ON FUNCTION pilot.pilot_direct_provision_binding_v1(
  text, text, text, text, text, pilot."PilotOfficeRole", boolean, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION pilot.pilot_list_direct_admin_bindings_v1(text) FROM PUBLIC;

COMMIT;
