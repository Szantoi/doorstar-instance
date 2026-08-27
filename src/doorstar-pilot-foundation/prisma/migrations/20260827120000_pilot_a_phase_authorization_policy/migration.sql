-- Doorstar isolated named-user pilot: A/P1 authorization policy.
--
-- This is append-only source evidence following the immutable F migration.
-- It must be applied only to the dedicated, empty pilot database by the
-- separately approved non-runtime migrator identity. It creates no PostgreSQL
-- login, credential, role mapping, IdP configuration, or external state.
--
-- The exact runtime/bootstrap login names are intentionally absent. After the
-- separate DBA/operations role-provisioning change, that owner must insert the
-- two reviewed PilotAuditWriterRole mappings and grant only the routine access
-- described at the end of this file. Until then every writer routine fails
-- closed because its source-to-session_user mapping is absent.

BEGIN;

-- F used unqualified objects only because it was a source-only empty lineage.
-- Move every F-owned object together; do not copy/replay historical data.
CREATE SCHEMA IF NOT EXISTS pilot;

ALTER TYPE public."PilotOfficeRole" SET SCHEMA pilot;
ALTER TYPE public."BindingAuditAction" SET SCHEMA pilot;
ALTER TYPE public."BindingAuditSource" SET SCHEMA pilot;

ALTER TABLE public."PilotScope" SET SCHEMA pilot;
ALTER TABLE public."AuthorizationTransaction" SET SCHEMA pilot;
ALTER TABLE public."PrincipalBinding" SET SCHEMA pilot;
ALTER TABLE public."OpaqueSession" SET SCHEMA pilot;
ALTER TABLE public."BindingAudit" SET SCHEMA pilot;

ALTER FUNCTION public."doorstar_pilot_reject_scope_mutation"() SET SCHEMA pilot;
ALTER FUNCTION public."doorstar_pilot_reject_binding_audit_mutation"() SET SCHEMA pilot;

-- F never admitted application data. Refuse a silent relocation or audit
-- rewrite should a caller attempt to apply A to anything other than that
-- isolated foundation. All five F tables must be empty before their physical
-- schema changes; no historical record is copied, replayed or backfilled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pilot."PilotScope")
     OR EXISTS (SELECT 1 FROM pilot."AuthorizationTransaction")
     OR EXISTS (SELECT 1 FROM pilot."PrincipalBinding")
     OR EXISTS (SELECT 1 FROM pilot."OpaqueSession")
     OR EXISTS (SELECT 1 FROM pilot."BindingAudit") THEN
    RAISE EXCEPTION
      'A/P1 requires an empty isolated F lineage; no data relocation or audit backfill is permitted'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE pilot."BindingAudit"
  ADD COLUMN "previousAuditVersion" INTEGER,
  ADD COLUMN "nextAuditVersion" INTEGER NOT NULL,
  ADD COLUMN "correlationId" UUID NOT NULL,
  ALTER COLUMN "witnessTransactionId" SET NOT NULL,
  ADD CONSTRAINT "BindingAudit_version_transition" CHECK (
    "nextAuditVersion" > 0
    AND (
      "previousAuditVersion" IS NULL
      OR (
        "previousAuditVersion" > 0
        AND "nextAuditVersion" = "previousAuditVersion" + 1
      )
    )
  );

CREATE UNIQUE INDEX "BindingAudit_scope_correlation_key"
  ON pilot."BindingAudit"("pilotScopeId", "correlationId");

-- SHOP_FLOOR remains in the immutable F enum only as historical vocabulary.
-- It is Plant execution authority, never a provisionable Doorstar Office
-- binding. The table constraint remains effective even if a future caller
-- obtains a writer path that was not anticipated by the TypeScript CLI.
ALTER TABLE pilot."PrincipalBinding"
  ADD CONSTRAINT "PrincipalBinding_office_role_only"
  CHECK ("role" <> 'SHOP_FLOOR'::pilot."PilotOfficeRole");

-- This policy table is intentionally non-tenant-owned. It is empty after this
-- migration, so routine execution is denied until a separately approved DBA
-- action records the exact two PostgreSQL login names.
CREATE TABLE pilot."PilotAuditWriterRole" (
  "source" pilot."BindingAuditSource" NOT NULL,
  "databaseRoleName" VARCHAR(63) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotAuditWriterRole_pkey" PRIMARY KEY ("source"),
  CONSTRAINT "PilotAuditWriterRole_databaseRoleName_key" UNIQUE ("databaseRoleName"),
  CONSTRAINT "PilotAuditWriterRole_databaseRoleName_format"
    CHECK ("databaseRoleName" ~ '^[a-z][a-z0-9_]{0,62}$')
);

-- The only scope context understood by pilot policy is transaction-local
-- app.current_pilot_scope_id. Invalid, absent, or empty context becomes NULL,
-- which makes each RLS policy deny rows rather than falling back to public or
-- a caller-selected tenant default.
CREATE FUNCTION pilot.doorstar_current_pilot_scope_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scope_text text;
BEGIN
  v_scope_text := pg_catalog.current_setting('app.current_pilot_scope_id', true);

  IF v_scope_text IS NULL OR v_scope_text = '' THEN
    RETURN NULL;
  END IF;

  IF v_scope_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_scope_text::uuid;
END;
$$;

-- The three scope-owned P1 tables keep FORCE RLS even for their owner. The
-- policy is deliberately TO PUBLIC: ACLs, not a policy name, grant access;
-- PUBLIC receives no table privileges below.
ALTER TABLE pilot."PrincipalBinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot."PrincipalBinding" FORCE ROW LEVEL SECURITY;
ALTER TABLE pilot."OpaqueSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot."OpaqueSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE pilot."BindingAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot."BindingAudit" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PrincipalBinding_pilot_scope_policy"
  ON pilot."PrincipalBinding"
  FOR ALL
  TO PUBLIC
  USING ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id())
  WITH CHECK ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id());

CREATE POLICY "OpaqueSession_pilot_scope_policy"
  ON pilot."OpaqueSession"
  FOR ALL
  TO PUBLIC
  USING ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id())
  WITH CHECK ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id());

CREATE POLICY "BindingAudit_pilot_scope_policy"
  ON pilot."BindingAudit"
  FOR ALL
  TO PUBLIC
  USING ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id())
  WITH CHECK ("pilotScopeId" = pilot.doorstar_current_pilot_scope_id());

-- Canonical DB mirror of the reviewed server manager whitelist. New enum
-- values are deny-by-default because only these explicit values can manage a
-- pilot roster; SHOP_FLOOR never qualifies.
CREATE FUNCTION pilot.doorstar_is_effective_pilot_roster_manager(
  p_active boolean,
  p_role pilot."PilotOfficeRole",
  p_can_manage_pilot_roster boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
  SELECT p_active IS TRUE
    AND p_can_manage_pilot_roster IS TRUE
    AND p_role IN (
      'SALES'::pilot."PilotOfficeRole",
      'TECHNICAL_PREPARATION'::pilot."PilotOfficeRole",
      'ORDER_APPROVER'::pilot."PilotOfficeRole",
      'PRODUCTION_PLANNER'::pilot."PilotOfficeRole",
      'INSTALLER'::pilot."PilotOfficeRole",
      'WAREHOUSE_DISPATCH'::pilot."PilotOfficeRole",
      'ADMINISTRATOR'::pilot."PilotOfficeRole",
      'READER'::pilot."PilotOfficeRole"
    );
$$;

CREATE FUNCTION pilot.doorstar_pilot_roster_lock_key(p_scope_id uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.hashtextextended(
    'doorstar.pilot.roster/v1:' || p_scope_id::text,
    0
  );
$$;

CREATE FUNCTION pilot.doorstar_require_pilot_write_context(
  p_source pilot."BindingAuditSource"
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
DECLARE
  v_scope_id uuid;
  v_scope_count bigint;
  v_database_role_name text;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'pilot writer routines require an explicit SERIALIZABLE transaction'
      USING ERRCODE = '25001';
  END IF;

  IF p_source IS NULL THEN
    RAISE EXCEPTION 'pilot writer routines require a DB-owned audit source'
      USING ERRCODE = '22023';
  END IF;

  v_scope_id := pilot.doorstar_current_pilot_scope_id();
  IF v_scope_id IS NULL THEN
    RAISE EXCEPTION 'app.current_pilot_scope_id is required and must be a UUID'
      USING ERRCODE = '22023';
  END IF;

  -- A SECURITY DEFINER writer cannot safely use current_user here because it
  -- is deliberately the migrator while its body executes. `session_user` is
  -- the original login and therefore remains the only non-launderable writer
  -- identity. Requiring the production one-scope fence here prevents a caller
  -- from running a standalone preflight and then switching scope/transaction.
  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pilot."PilotScope" WHERE "id" = v_scope_id
     ) THEN
    RAISE EXCEPTION 'pilot writer requires exactly one configured production scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT "databaseRoleName"
    INTO v_database_role_name
    FROM pilot."PilotAuditWriterRole"
    WHERE "source" = p_source;
  IF v_database_role_name IS NULL OR v_database_role_name <> session_user::text THEN
    RAISE EXCEPTION 'pilot writer source % is not mapped to this session login', p_source
      USING ERRCODE = '42501';
  END IF;

  RETURN v_scope_id;
END;
$$;

-- The original session_user, not current_user, is checked so the approved
-- SECURITY DEFINER writers cannot launder a runtime caller through the
-- migration owner. An absent mapping is intentionally an access denial.
CREATE FUNCTION pilot.doorstar_require_pilot_audit_writer(
  p_source pilot."BindingAuditSource"
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
DECLARE
  v_database_role_name text;
BEGIN
  SELECT "databaseRoleName"
    INTO v_database_role_name
    FROM pilot."PilotAuditWriterRole"
    WHERE "source" = p_source;

  IF v_database_role_name IS NULL OR v_database_role_name <> session_user::text THEN
    RAISE EXCEPTION 'pilot writer source % is not mapped to this session login', p_source
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION pilot.doorstar_require_effective_pilot_roster_manager(
  p_scope_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pilot."PrincipalBinding" AS binding
      WHERE binding."pilotScopeId" = p_scope_id
        AND pilot.doorstar_is_effective_pilot_roster_manager(
          binding."active",
          binding."role",
          binding."canManagePilotRoster"
        )
  ) THEN
    RAISE EXCEPTION 'pilot scope % must retain an effective roster manager', p_scope_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- The first trigger serializes manager-loss candidates before the deferred
-- invariant runs. It closes write-skew when two connections demote different
-- managers concurrently.
CREATE FUNCTION pilot.doorstar_lock_pilot_manager_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
BEGIN
  IF pilot.doorstar_is_effective_pilot_roster_manager(
       OLD."active", OLD."role", OLD."canManagePilotRoster"
     )
     AND NOT pilot.doorstar_is_effective_pilot_roster_manager(
       NEW."active", NEW."role", NEW."canManagePilotRoster"
     ) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pilot.doorstar_pilot_roster_lock_key(OLD."pilotScopeId")
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION pilot.doorstar_require_pilot_manager_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
BEGIN
  IF pilot.doorstar_is_effective_pilot_roster_manager(
       OLD."active", OLD."role", OLD."canManagePilotRoster"
     )
     AND NOT pilot.doorstar_is_effective_pilot_roster_manager(
       NEW."active", NEW."role", NEW."canManagePilotRoster"
     ) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pilot.doorstar_pilot_roster_lock_key(NEW."pilotScopeId")
    );
    PERFORM pilot.doorstar_require_effective_pilot_roster_manager(
      NEW."pilotScopeId"
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "PrincipalBinding_lock_manager_loss"
  BEFORE UPDATE OF "role", "active", "canManagePilotRoster"
  ON pilot."PrincipalBinding"
  FOR EACH ROW
  EXECUTE FUNCTION pilot.doorstar_lock_pilot_manager_loss();

CREATE CONSTRAINT TRIGGER "PrincipalBinding_effective_manager_required"
  AFTER UPDATE ON pilot."PrincipalBinding"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION pilot.doorstar_require_pilot_manager_after_change();

-- Every audit insert is DB-witnessed. The direct/bootstrap routines hard-code
-- source and derive the actor; no routine takes a browser-selected source,
-- scope, audit version, or witness transaction id.
CREATE FUNCTION pilot.doorstar_guard_binding_audit_insert()
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
       NEW."action" = 'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction"
       AND (NEW."previousAuditVersion" IS NOT NULL OR NEW."nextAuditVersion" <> 1)
     )
     OR (
       NEW."action" <> 'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction"
       AND (
         NEW."previousAuditVersion" IS NULL
         OR NEW."nextAuditVersion" <> NEW."previousAuditVersion" + 1
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
    IF NEW."actorBindingId" IS NULL OR NEW."actorBindingId" = NEW."bindingId" THEN
      RAISE EXCEPTION 'direct roster changes require a distinct manager actor'
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
    IF NEW."actorBindingId" IS NOT NULL
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

CREATE TRIGGER "BindingAudit_write_guard"
  BEFORE INSERT ON pilot."BindingAudit"
  FOR EACH ROW
  EXECUTE FUNCTION pilot.doorstar_guard_binding_audit_insert();

-- Production adapters call their source-specific preflight after resolving the
-- configured scope key on the server and setting app.current_pilot_scope_id
-- transaction-locally. A browser cannot choose that value. The routines are
-- SECURITY INVOKER specifically so SET ROLE is visible and rejected.
CREATE FUNCTION pilot.pilot_runtime_preflight_v1()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
DECLARE
  v_scope_id uuid;
  v_scope_count bigint;
  v_scope_text text;
  v_database_role_name text;
BEGIN
  IF current_user <> session_user THEN
    RAISE EXCEPTION 'runtime preflight rejects SET ROLE or delegated current_user'
      USING ERRCODE = '42501';
  END IF;

  v_scope_text := pg_catalog.current_setting('app.current_pilot_scope_id', true);
  IF v_scope_text IS NULL
     OR v_scope_text = ''
     OR v_scope_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'runtime preflight requires app.current_pilot_scope_id'
      USING ERRCODE = '22023';
  END IF;
  v_scope_id := v_scope_text::uuid;

  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pilot."PilotScope" WHERE "id" = v_scope_id
     ) THEN
    RAISE EXCEPTION 'production pilot preflight requires exactly one configured scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT "databaseRoleName"
    INTO v_database_role_name
    FROM pilot."PilotAuditWriterRole"
    WHERE "source" = 'DIRECT_ADMIN'::pilot."BindingAuditSource";
  IF v_database_role_name IS NULL OR v_database_role_name <> session_user::text THEN
    RAISE EXCEPTION 'runtime preflight login is not the approved DIRECT_ADMIN writer'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION pilot.pilot_bootstrap_preflight_v1()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pilot, pg_temp
AS $$
DECLARE
  v_scope_id uuid;
  v_scope_count bigint;
  v_scope_text text;
  v_database_role_name text;
BEGIN
  IF current_user <> session_user THEN
    RAISE EXCEPTION 'bootstrap preflight rejects SET ROLE or delegated current_user'
      USING ERRCODE = '42501';
  END IF;

  v_scope_text := pg_catalog.current_setting('app.current_pilot_scope_id', true);
  IF v_scope_text IS NULL
     OR v_scope_text = ''
     OR v_scope_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'bootstrap preflight requires app.current_pilot_scope_id'
      USING ERRCODE = '22023';
  END IF;
  v_scope_id := v_scope_text::uuid;

  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pilot."PilotScope" WHERE "id" = v_scope_id
     ) THEN
    RAISE EXCEPTION 'production pilot preflight requires exactly one configured scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT "databaseRoleName"
    INTO v_database_role_name
    FROM pilot."PilotAuditWriterRole"
    WHERE "source" = 'BOOTSTRAP_CLI'::pilot."BindingAuditSource";
  IF v_database_role_name IS NULL OR v_database_role_name <> session_user::text THEN
    RAISE EXCEPTION 'bootstrap preflight login is not the approved BOOTSTRAP_CLI writer'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Authorization transactions are scope-neutral records, but their creation
-- and single consumption still require the same fixed production runtime
-- identity and transaction-local scope proof as all other BFF writes. The
-- BFF receives no raw INSERT/UPDATE privilege on this table.
CREATE FUNCTION pilot.pilot_create_authorization_transaction_v1(
  p_state_hash text,
  p_browser_binding_hash text,
  p_nonce_hash text,
  p_code_verifier_ciphertext bytea,
  p_expires_at timestamp(3) without time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
DECLARE
  v_transaction_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  PERFORM pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  IF p_state_hash IS NULL
     OR p_state_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_browser_binding_hash IS NULL
     OR p_browser_binding_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_nonce_hash IS NULL
     OR p_nonce_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_code_verifier_ciphertext IS NULL
     OR octet_length(p_code_verifier_ciphertext) < 1
     OR octet_length(p_code_verifier_ciphertext) > 4096
     OR p_expires_at IS NULL
     OR p_expires_at <= CURRENT_TIMESTAMP
     OR p_expires_at > CURRENT_TIMESTAMP + INTERVAL '15 minutes' THEN
    RAISE EXCEPTION 'invalid authorization transaction arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO pilot."AuthorizationTransaction" (
    "id", "stateHash", "browserBindingHash", "nonceHash", "codeVerifierCiphertext",
    "expiresAt", "consumedAt", "createdAt"
  ) VALUES (
    v_transaction_id, p_state_hash, p_browser_binding_hash, p_nonce_hash, p_code_verifier_ciphertext,
    p_expires_at, NULL, CURRENT_TIMESTAMP
  );

  RETURN v_transaction_id;
END;
$$;

CREATE FUNCTION pilot.pilot_consume_authorization_transaction_v1(
  p_state_hash text,
  p_browser_binding_hash text
)
RETURNS TABLE (
  "id" uuid,
  "nonceHash" text,
  "codeVerifierCiphertext" bytea,
  "createdAt" timestamp(3) without time zone,
  "expiresAt" timestamp(3) without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
BEGIN
  PERFORM pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  IF p_state_hash IS NULL
     OR p_state_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_browser_binding_hash IS NULL
     OR p_browser_binding_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'invalid authorization transaction lookup arguments' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE pilot."AuthorizationTransaction" AS transaction_row
    SET "consumedAt" = CURRENT_TIMESTAMP
    WHERE transaction_row."stateHash" = p_state_hash
      AND transaction_row."browserBindingHash" = p_browser_binding_hash
      AND transaction_row."consumedAt" IS NULL
      AND transaction_row."expiresAt" > CURRENT_TIMESTAMP
    RETURNING
      transaction_row."id",
      transaction_row."nonceHash",
      transaction_row."codeVerifierCiphertext",
      transaction_row."createdAt",
      transaction_row."expiresAt";
END;
$$;

-- Runtime direct roster writer. The actor is resolved from a live opaque
-- session hash inside the protected scope; it cannot be supplied as a binding
-- id, actor key, role, source, or scope by the caller.
CREATE FUNCTION pilot.pilot_direct_update_binding_v1(
  p_actor_session_token_hash text,
  p_target_binding_id uuid,
  p_expected_audit_version integer,
  p_next_role pilot."PilotOfficeRole",
  p_next_active boolean,
  p_next_can_manage_pilot_roster boolean,
  p_reason text,
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
  v_target_before pilot."PrincipalBinding"%ROWTYPE;
  v_target_after pilot."PrincipalBinding"%ROWTYPE;
  v_action pilot."BindingAuditAction";
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  -- Every roster mutator takes the same scope advisory lock before acquiring
  -- any binding/session row lock. Bootstrap provision/revoke follow this
  -- order too, so an actor row shared by a direct writer cannot deadlock a
  -- bootstrap revoke that needs to deactivate that binding.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pilot.doorstar_pilot_roster_lock_key(v_scope_id)
  );

  IF p_actor_session_token_hash IS NULL
     OR p_actor_session_token_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_target_binding_id IS NULL
     OR p_expected_audit_version IS NULL
     OR p_expected_audit_version <= 0
     OR p_next_role IS NULL
     OR p_next_role = 'SHOP_FLOOR'::pilot."PilotOfficeRole"
     OR p_next_active IS NULL
     OR p_next_can_manage_pilot_roster IS NULL
     OR p_reason IS NULL
     OR btrim(p_reason) = ''
     OR char_length(p_reason) > 500
     OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid direct roster writer arguments' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'direct roster writer requires a live effective-manager session'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor."id" = p_target_binding_id THEN
    RAISE EXCEPTION 'a roster manager cannot change its own binding'
      USING ERRCODE = '42501';
  END IF;

  SELECT binding.*
    INTO v_target_before
    FROM pilot."PrincipalBinding" AS binding
    WHERE binding."id" = p_target_binding_id
      AND binding."pilotScopeId" = v_scope_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target binding is absent from the current pilot scope'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE pilot."PrincipalBinding"
    SET "role" = p_next_role,
        "active" = p_next_active,
        "canManagePilotRoster" = p_next_can_manage_pilot_roster,
        "auditVersion" = "auditVersion" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_target_binding_id
      AND "pilotScopeId" = v_scope_id
      AND "auditVersion" = p_expected_audit_version
    RETURNING * INTO v_target_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target binding audit version is stale'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE pilot."OpaqueSession"
    SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
        "providerAccessTokenCiphertext" = NULL
    WHERE "pilotScopeId" = v_scope_id
      AND "bindingId" = p_target_binding_id
      AND "revokedAt" IS NULL;

  v_action := CASE
    WHEN v_target_before."active" AND NOT v_target_after."active"
      THEN 'BINDING_DEACTIVATED'::pilot."BindingAuditAction"
    WHEN NOT v_target_before."active" AND v_target_after."active"
      THEN 'BINDING_REACTIVATED'::pilot."BindingAuditAction"
    ELSE 'DIRECT_ADMIN_UPDATE'::pilot."BindingAuditAction"
  END;

  INSERT INTO pilot."BindingAudit" (
    "id", "pilotScopeId", "bindingId", "actorBindingId", "action", "source",
    "previousRole", "nextRole", "previousActive", "nextActive",
    "previousCanManagePilotRoster", "nextCanManagePilotRoster", "reason",
    "approvalReference", "previousAuditVersion", "nextAuditVersion", "correlationId",
    "witnessTransactionId", "createdAt"
  ) VALUES (
    pg_catalog.gen_random_uuid(), v_scope_id, v_target_after."id", v_actor."id",
    v_action, 'DIRECT_ADMIN'::pilot."BindingAuditSource",
    v_target_before."role", v_target_after."role",
    v_target_before."active", v_target_after."active",
    v_target_before."canManagePilotRoster", v_target_after."canManagePilotRoster",
    p_reason, NULL, v_target_before."auditVersion", v_target_after."auditVersion", p_correlation_id,
    pg_catalog.txid_current(), CURRENT_TIMESTAMP
  );

  PERFORM pilot.doorstar_require_effective_pilot_roster_manager(v_scope_id);
  RETURN v_target_after."id";
END;
$$;

-- Bootstrap has only two operations: active provisioning and revoke. It has
-- no role-change, reactivation, arbitrary update, or raw binding/audit DML
-- path. The initial manager check happens before any durable write.
CREATE FUNCTION pilot.pilot_bootstrap_provision_binding_v1(
  p_issuer text,
  p_subject_digest text,
  p_actor_key text,
  p_display_name text,
  p_role pilot."PilotOfficeRole",
  p_can_manage_pilot_roster boolean,
  p_approval_reference text,
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
  v_has_bindings boolean;
  v_has_effective_manager boolean;
  v_binding_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'BOOTSTRAP_CLI'::pilot."BindingAuditSource"
  );

  IF p_issuer IS NULL
     OR btrim(p_issuer) = ''
     OR char_length(p_issuer) > 2048
     OR p_subject_digest IS NULL
     OR p_subject_digest !~ '^[0-9a-fA-F]{64}$'
     OR p_actor_key IS NULL
     OR p_actor_key !~ '^[0-9a-fA-F]{64}$'
     OR p_display_name IS NULL
     OR btrim(p_display_name) = ''
     OR char_length(p_display_name) > 160
     OR p_role IS NULL
     OR p_role = 'SHOP_FLOOR'::pilot."PilotOfficeRole"
     OR p_can_manage_pilot_roster IS NULL
     OR p_approval_reference IS NULL
     OR btrim(p_approval_reference) = ''
     OR char_length(p_approval_reference) > 160
     OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid bootstrap provision arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pilot.doorstar_pilot_roster_lock_key(v_scope_id)
  );

  SELECT EXISTS (
    SELECT 1
      FROM pilot."PrincipalBinding" AS binding
      WHERE binding."pilotScopeId" = v_scope_id
  ) INTO v_has_bindings;

  SELECT EXISTS (
    SELECT 1
      FROM pilot."PrincipalBinding" AS binding
      WHERE binding."pilotScopeId" = v_scope_id
        AND pilot.doorstar_is_effective_pilot_roster_manager(
          binding."active", binding."role", binding."canManagePilotRoster"
        )
  ) INTO v_has_effective_manager;

  IF v_has_bindings AND NOT v_has_effective_manager THEN
    RAISE EXCEPTION 'bootstrap cannot repair a non-empty managerless pilot roster'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_has_bindings
     AND NOT pilot.doorstar_is_effective_pilot_roster_manager(
       true, p_role, p_can_manage_pilot_roster
     ) THEN
    RAISE EXCEPTION 'the first bootstrap binding must be an active effective manager'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO pilot."PrincipalBinding" (
    "id", "pilotScopeId", "actorKey", "issuer", "subjectDigest", "displayName",
    "role", "active", "canManagePilotRoster", "auditVersion", "createdAt", "updatedAt"
  ) VALUES (
    v_binding_id, v_scope_id, p_actor_key, p_issuer, p_subject_digest, p_display_name,
    p_role, true, p_can_manage_pilot_roster, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO pilot."BindingAudit" (
    "id", "pilotScopeId", "bindingId", "actorBindingId", "action", "source",
    "previousRole", "nextRole", "previousActive", "nextActive",
    "previousCanManagePilotRoster", "nextCanManagePilotRoster", "reason",
    "approvalReference", "previousAuditVersion", "nextAuditVersion", "correlationId",
    "witnessTransactionId", "createdAt"
  ) VALUES (
    pg_catalog.gen_random_uuid(), v_scope_id, v_binding_id, NULL,
    'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction",
    'BOOTSTRAP_CLI'::pilot."BindingAuditSource",
    NULL, p_role, NULL, true, NULL, p_can_manage_pilot_roster,
    'bootstrap-provision', p_approval_reference, NULL, 1, p_correlation_id,
    pg_catalog.txid_current(), CURRENT_TIMESTAMP
  );

  PERFORM pilot.doorstar_require_effective_pilot_roster_manager(v_scope_id);
  RETURN v_binding_id;
END;
$$;

CREATE FUNCTION pilot.pilot_bootstrap_revoke_binding_v1(
  p_binding_id uuid,
  p_expected_audit_version integer,
  p_approval_reference text,
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
  v_target_before pilot."PrincipalBinding"%ROWTYPE;
  v_target_after pilot."PrincipalBinding"%ROWTYPE;
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'BOOTSTRAP_CLI'::pilot."BindingAuditSource"
  );

  IF p_binding_id IS NULL
     OR p_expected_audit_version IS NULL
     OR p_expected_audit_version <= 0
     OR p_approval_reference IS NULL
     OR btrim(p_approval_reference) = ''
     OR char_length(p_approval_reference) > 160
     OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid bootstrap revoke arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pilot.doorstar_pilot_roster_lock_key(v_scope_id)
  );

  SELECT binding.*
    INTO v_target_before
    FROM pilot."PrincipalBinding" AS binding
    WHERE binding."id" = p_binding_id
      AND binding."pilotScopeId" = v_scope_id
    FOR UPDATE;

  IF NOT FOUND OR NOT v_target_before."active" THEN
    RAISE EXCEPTION 'bootstrap revoke requires an active binding in the current scope'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE pilot."PrincipalBinding"
    SET "active" = false,
        "auditVersion" = "auditVersion" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_binding_id
      AND "pilotScopeId" = v_scope_id
      AND "auditVersion" = p_expected_audit_version
    RETURNING * INTO v_target_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target binding audit version is stale'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE pilot."OpaqueSession"
    SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
        "providerAccessTokenCiphertext" = NULL
    WHERE "pilotScopeId" = v_scope_id
      AND "bindingId" = p_binding_id
      AND "revokedAt" IS NULL;

  INSERT INTO pilot."BindingAudit" (
    "id", "pilotScopeId", "bindingId", "actorBindingId", "action", "source",
    "previousRole", "nextRole", "previousActive", "nextActive",
    "previousCanManagePilotRoster", "nextCanManagePilotRoster", "reason",
    "approvalReference", "previousAuditVersion", "nextAuditVersion", "correlationId",
    "witnessTransactionId", "createdAt"
  ) VALUES (
    pg_catalog.gen_random_uuid(), v_scope_id, v_target_after."id", NULL,
    'BINDING_DEACTIVATED'::pilot."BindingAuditAction",
    'BOOTSTRAP_CLI'::pilot."BindingAuditSource",
    v_target_before."role", v_target_after."role",
    v_target_before."active", v_target_after."active",
    v_target_before."canManagePilotRoster", v_target_after."canManagePilotRoster",
    'bootstrap-revoke', p_approval_reference, v_target_before."auditVersion", v_target_after."auditVersion",
    p_correlation_id, pg_catalog.txid_current(), CURRENT_TIMESTAMP
  );

  PERFORM pilot.doorstar_require_effective_pilot_roster_manager(v_scope_id);
  RETURN v_target_after."id";
END;
$$;

-- Opaque sessions are issued/revoked only through narrow runtime writers; no
-- runtime or bootstrap ACL below can directly mutate PrincipalBinding,
-- BindingAudit or AuthorizationTransaction to fabricate an actor, source,
-- audit witness or callback state.
CREATE FUNCTION pilot.pilot_issue_opaque_session_v1(
  p_binding_id uuid,
  p_session_token_hash text,
  p_provider_access_token_ciphertext bytea,
  p_expires_at timestamp(3) without time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
DECLARE
  v_scope_id uuid;
  v_binding pilot."PrincipalBinding"%ROWTYPE;
  v_session_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  IF p_binding_id IS NULL
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-fA-F]{64}$'
     OR p_expires_at IS NULL
     OR p_expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'invalid opaque session arguments' USING ERRCODE = '22023';
  END IF;

  SELECT binding.*
    INTO v_binding
    FROM pilot."PrincipalBinding" AS binding
    WHERE binding."id" = p_binding_id
      AND binding."pilotScopeId" = v_scope_id
    FOR SHARE;

  IF NOT FOUND OR NOT v_binding."active" THEN
    RAISE EXCEPTION 'opaque session requires an active binding in the current scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO pilot."OpaqueSession" (
    "id", "pilotScopeId", "bindingId", "sessionTokenHash",
    "providerAccessTokenCiphertext", "bindingEpoch", "issuedAt", "expiresAt", "revokedAt"
  ) VALUES (
    v_session_id, v_scope_id, v_binding."id", p_session_token_hash,
    p_provider_access_token_ciphertext, v_binding."auditVersion",
    CURRENT_TIMESTAMP, p_expires_at, NULL
  );

  RETURN v_session_id;
END;
$$;

CREATE FUNCTION pilot.pilot_revoke_opaque_session_v1(
  p_session_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pilot, pg_temp
SET row_security = on
AS $$
DECLARE
  v_scope_id uuid;
BEGIN
  v_scope_id := pilot.doorstar_require_pilot_write_context(
    'DIRECT_ADMIN'::pilot."BindingAuditSource"
  );

  IF p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'invalid opaque session token hash' USING ERRCODE = '22023';
  END IF;

  UPDATE pilot."OpaqueSession"
    SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
        "providerAccessTokenCiphertext" = NULL
    WHERE "pilotScopeId" = v_scope_id
      AND "sessionTokenHash" = p_session_token_hash
      AND "revokedAt" IS NULL;

  RETURN FOUND;
END;
$$;

-- Deny by default. No concrete runtime/bootstrap PostgreSQL identifiers are
-- invented here. The later DBA/operations change must use the two configured
-- PilotAuditWriterRole login names and must retain the following boundary:
--
--   runtime:   USAGE on schema pilot; narrowly scoped SELECT on PilotScope
--              and PilotAuditWriterRole for its preflight (plus only the
--              separately inventoried session/roster reads); EXECUTE only
--              pilot_runtime_preflight_v1,
--              pilot_create_authorization_transaction_v1,
--              pilot_consume_authorization_transaction_v1,
--              pilot_direct_update_binding_v1,
--              pilot_issue_opaque_session_v1, and
--              pilot_revoke_opaque_session_v1.
--   bootstrap: USAGE on schema pilot; narrowly scoped SELECT on PilotScope
--              and PilotAuditWriterRole for its preflight; EXECUTE only
--              pilot_bootstrap_preflight_v1,
--              pilot_bootstrap_provision_binding_v1 and
--              pilot_bootstrap_revoke_binding_v1.
--
-- Neither identity may receive INSERT/UPDATE/DELETE on PrincipalBinding or
-- BindingAudit, EXECUTE on the other writer path, ownership, BYPASSRLS,
-- SUPERUSER, CREATE, TEMPORARY, SET ROLE, or a usable membership chain. The
-- migrator owns the SECURITY DEFINER writers and remains a non-runtime,
-- NOBYPASSRLS identity. The DBA evidence must prove those properties.
REVOKE ALL ON SCHEMA pilot FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA pilot FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pilot FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pilot FROM PUBLIC;

COMMIT;
