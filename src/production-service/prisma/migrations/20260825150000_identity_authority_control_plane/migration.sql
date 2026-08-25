-- DSCONV-03 M1B: isolated Doorstar identity-authority control plane.
-- This migration intentionally does not touch legacy business tables, create a
-- database role, enable RLS, configure Keycloak, or mint any session/cookie.

CREATE TYPE "DoorstarTenantBindingStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "DoorstarSessionCapability" AS ENUM ('view', 'edit', 'admin');

-- PostgreSQL timestamps cannot retain nine fractional digits. This immutable
-- parser verifies the canonical wire value against its separately persisted
-- epoch/nanosecond pair without accepting calendar rollover or rounding.
CREATE FUNCTION doorstar_m1b_exact_utc_triplet(
  wire_value TEXT,
  expected_epoch_seconds BIGINT,
  expected_nanoseconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  wire_parts TEXT[];
  parsed_timestamp TIMESTAMPTZ;
  normalized_nanoseconds INTEGER;
BEGIN
  wire_parts := pg_catalog.regexp_match(
    wire_value,
    '^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.]([0-9]{1,9}))?Z$'
  );
  IF wire_parts IS NULL OR wire_parts[1] = '0000' THEN
    RETURN FALSE;
  END IF;

  parsed_timestamp := (substring(wire_value FROM 1 FOR 19) || 'Z')::TIMESTAMPTZ;
  IF pg_catalog.to_char(
    parsed_timestamp AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS'
  ) <> substring(wire_value FROM 1 FOR 19) THEN
    RETURN FALSE;
  END IF;
  normalized_nanoseconds := pg_catalog.rpad(COALESCE(wire_parts[7], ''), 9, '0')::INTEGER;
  RETURN pg_catalog.floor(pg_catalog.date_part('epoch', parsed_timestamp))::BIGINT = expected_epoch_seconds
    AND normalized_nanoseconds = expected_nanoseconds;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

CREATE TABLE "DoorstarInstanceTenantBinding" (
  "id" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "status" "DoorstarTenantBindingStatus" NOT NULL DEFAULT 'ACTIVE',
  "bindingVersion" BIGINT NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMPTZ(6),
  "disabledReason" TEXT,
  CONSTRAINT "DoorstarInstanceTenantBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DoorstarInstanceTenantBinding_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "DoorstarInstanceTenantBinding_reserved_tenant_check" CHECK (
    "tenantId" NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  CONSTRAINT "DoorstarInstanceTenantBinding_lifecycle_check" CHECK (
    "bindingVersion" >= 1
    AND (
      ("status" = 'ACTIVE' AND "disabledAt" IS NULL AND "disabledReason" IS NULL)
      OR (
        "status" = 'DISABLED'
        AND "disabledAt" IS NOT NULL
        AND "disabledReason" IS NOT NULL
        AND char_length("disabledReason") BETWEEN 1 AND 256
        AND btrim("disabledReason") = "disabledReason"
      )
    )
  )
);

-- A partial active-only unique index would permit rebind after disable. This
-- expression index instead permits exactly one row for the database lifetime.
CREATE UNIQUE INDEX "DoorstarInstanceTenantBinding_instance_singleton_key"
  ON "DoorstarInstanceTenantBinding" ((1));

CREATE TABLE "IdentityAuthorityEvidence" (
  "id" TEXT NOT NULL,
  "tenantBindingId" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "bindingVersion" BIGINT NOT NULL,
  "subject" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "membershipVersion" BIGINT NOT NULL,
  "projectionVersion" BIGINT NOT NULL,
  "enabledModules" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "acceptTokensIssuedAtOrAfterWire" TEXT NOT NULL,
  "acceptTokensIssuedAtOrAfterEpochSeconds" BIGINT NOT NULL,
  "acceptTokensIssuedAtOrAfterNanoseconds" INTEGER NOT NULL,
  "tokenIssuedAtWire" TEXT NOT NULL,
  "tokenIssuedAtEpochSeconds" BIGINT NOT NULL,
  "tokenIssuedAtNanoseconds" INTEGER NOT NULL,
  "tokenExpiresAtWire" TEXT NOT NULL,
  "tokenExpiresAtEpochSeconds" BIGINT NOT NULL,
  "tokenExpiresAtNanoseconds" INTEGER NOT NULL,
  "stateMacKeyVersion" INTEGER NOT NULL,
  "stateMac" BYTEA NOT NULL,
  "correlationId" UUID NOT NULL,
  "evidenceVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityAuthorityEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityAuthorityEvidence_id_tenantBindingId_key" UNIQUE ("id", "tenantBindingId"),
  CONSTRAINT "IdentityAuthorityEvidence_schema_and_version_check" CHECK (
    "schemaVersion" = 'spaceos.online-identity-authority/v1'
    AND "evidenceVersion" = 1
    AND "bindingVersion" >= 1
    AND "membershipVersion" >= 1
    AND "projectionVersion" >= 1
    AND char_length("subject") BETWEEN 1 AND 256
    AND "subject" !~ '[[:space:][:cntrl:]]'
  ),
  CONSTRAINT "IdentityAuthorityEvidence_lists_and_mac_check" CHECK (
    jsonb_typeof("enabledModules") = 'array'
    AND jsonb_typeof("permissions") = 'array'
    AND "stateMacKeyVersion" >= 1
    AND octet_length("stateMac") = 32
    AND "correlationId" IS NOT NULL
  ),
  CONSTRAINT "IdentityAuthorityEvidence_nanos_check" CHECK (
    "acceptTokensIssuedAtOrAfterNanoseconds" BETWEEN 0 AND 999999999
    AND "tokenIssuedAtNanoseconds" BETWEEN 0 AND 999999999
    AND "tokenExpiresAtNanoseconds" BETWEEN 0 AND 999999999
  ),
  CONSTRAINT "IdentityAuthorityEvidence_exact_time_order_check" CHECK (
    ("tokenIssuedAtEpochSeconds", "tokenIssuedAtNanoseconds")
      >= ("acceptTokensIssuedAtOrAfterEpochSeconds", "acceptTokensIssuedAtOrAfterNanoseconds")
    AND ("tokenExpiresAtEpochSeconds", "tokenExpiresAtNanoseconds")
      > ("tokenIssuedAtEpochSeconds", "tokenIssuedAtNanoseconds")
    AND char_length("acceptTokensIssuedAtOrAfterWire") BETWEEN 1 AND 64
    AND char_length("tokenIssuedAtWire") BETWEEN 1 AND 64
    AND char_length("tokenExpiresAtWire") BETWEEN 1 AND 64
    AND doorstar_m1b_exact_utc_triplet(
      "acceptTokensIssuedAtOrAfterWire",
      "acceptTokensIssuedAtOrAfterEpochSeconds",
      "acceptTokensIssuedAtOrAfterNanoseconds"
    )
    AND doorstar_m1b_exact_utc_triplet(
      "tokenIssuedAtWire", "tokenIssuedAtEpochSeconds", "tokenIssuedAtNanoseconds"
    )
    AND doorstar_m1b_exact_utc_triplet(
      "tokenExpiresAtWire", "tokenExpiresAtEpochSeconds", "tokenExpiresAtNanoseconds"
    )
  )
);

CREATE INDEX "IdentityAuthorityEvidence_tenantBindingId_subject_createdAt_idx"
  ON "IdentityAuthorityEvidence" ("tenantBindingId", "subject", "createdAt");

CREATE TABLE "DoorstarSession" (
  "id" TEXT NOT NULL,
  "sessionSelector" TEXT NOT NULL,
  "verifierMacKeyVersion" INTEGER NOT NULL,
  "verifierMac" BYTEA NOT NULL,
  "csrfMacKeyVersion" INTEGER NOT NULL,
  "csrfMac" BYTEA NOT NULL,
  "stateMacKeyVersion" INTEGER NOT NULL,
  "stateMac" BYTEA NOT NULL,
  "tenantBindingId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "capability" "DoorstarSessionCapability" NOT NULL,
  "bindingVersion" BIGINT NOT NULL,
  "issuedAtWire" TEXT NOT NULL,
  "issuedAtEpochSeconds" BIGINT NOT NULL,
  "issuedAtNanoseconds" INTEGER NOT NULL,
  "expiresAtWire" TEXT NOT NULL,
  "expiresAtEpochSeconds" BIGINT NOT NULL,
  "expiresAtNanoseconds" INTEGER NOT NULL,
  "revokedAt" TIMESTAMPTZ(6),
  "revokeReason" TEXT,
  "lastValidatedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoorstarSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DoorstarSession_sessionSelector_key" UNIQUE ("sessionSelector"),
  CONSTRAINT "DoorstarSession_verifierMacKeyVersion_verifierMac_key"
    UNIQUE ("verifierMacKeyVersion", "verifierMac"),
  CONSTRAINT "DoorstarSession_csrfMacKeyVersion_csrfMac_key"
    UNIQUE ("csrfMacKeyVersion", "csrfMac"),
  CONSTRAINT "DoorstarSession_selector_and_mac_check" CHECK (
    "sessionSelector" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "verifierMacKeyVersion" >= 1
    AND octet_length("verifierMac") = 32
    AND "csrfMacKeyVersion" >= 1
    AND octet_length("csrfMac") = 32
    AND "stateMacKeyVersion" >= 1
    AND octet_length("stateMac") = 32
  ),
  CONSTRAINT "DoorstarSession_authority_and_lifecycle_check" CHECK (
    "bindingVersion" >= 1
    AND char_length("subject") BETWEEN 1 AND 256
    AND "subject" !~ '[[:space:][:cntrl:]]'
    AND "issuedAtNanoseconds" BETWEEN 0 AND 999999999
    AND "expiresAtNanoseconds" BETWEEN 0 AND 999999999
    AND ("expiresAtEpochSeconds", "expiresAtNanoseconds")
      > ("issuedAtEpochSeconds", "issuedAtNanoseconds")
    AND char_length("issuedAtWire") BETWEEN 1 AND 64
    AND char_length("expiresAtWire") BETWEEN 1 AND 64
    AND doorstar_m1b_exact_utc_triplet(
      "issuedAtWire", "issuedAtEpochSeconds", "issuedAtNanoseconds"
    )
    AND doorstar_m1b_exact_utc_triplet(
      "expiresAtWire", "expiresAtEpochSeconds", "expiresAtNanoseconds"
    )
    AND (
      ("revokedAt" IS NULL AND "revokeReason" IS NULL)
      OR (
        "revokedAt" IS NOT NULL
        AND "revokeReason" IS NOT NULL
        AND char_length("revokeReason") BETWEEN 1 AND 256
        AND btrim("revokeReason") = "revokeReason"
      )
    )
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND ("lastValidatedAt" IS NULL OR "lastValidatedAt" >= "createdAt")
  )
);

CREATE INDEX "DoorstarSession_tenantBindingId_revokedAt_expiry_idx"
  ON "DoorstarSession" (
    "tenantBindingId", "revokedAt", "expiresAtEpochSeconds", "expiresAtNanoseconds"
  );

ALTER TABLE "IdentityAuthorityEvidence"
  ADD CONSTRAINT "IdentityAuthorityEvidence_tenantBindingId_tenantId_fkey"
  FOREIGN KEY ("tenantBindingId", "tenantId")
  REFERENCES "DoorstarInstanceTenantBinding" ("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "DoorstarSession"
  ADD CONSTRAINT "DoorstarSession_tenantBindingId_fkey"
  FOREIGN KEY ("tenantBindingId")
  REFERENCES "DoorstarInstanceTenantBinding" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "DoorstarSession"
  ADD CONSTRAINT "DoorstarSession_evidenceId_tenantBindingId_fkey"
  FOREIGN KEY ("evidenceId", "tenantBindingId")
  REFERENCES "IdentityAuthorityEvidence" ("id", "tenantBindingId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Validates the exact v1 grant vocabulary and returns the only possible narrow
-- Doorstar capability. It is invoked for every evidence/session insertion;
-- unknown, unsorted, duplicated, cross-module, or malformed pairs fail closed.
CREATE FUNCTION doorstar_m1b_derive_capability(
  enabled_modules JSONB,
  permission_values JSONB
) RETURNS "DoorstarSessionCapability"
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item_index INTEGER;
  module_id TEXT;
  permission_value TEXT;
  action_value TEXT;
  previous_module_id TEXT := NULL;
  previous_permission_value TEXT := NULL;
  doorstar_grant_count INTEGER := 0;
  derived_capability "DoorstarSessionCapability" := NULL;
BEGIN
  IF jsonb_typeof(enabled_modules) <> 'array'
    OR jsonb_typeof(permission_values) <> 'array'
    OR jsonb_array_length(enabled_modules) = 0
    OR jsonb_array_length(enabled_modules) > 10
    OR jsonb_array_length(enabled_modules) <> jsonb_array_length(permission_values) THEN
    RAISE EXCEPTION 'DS_M1B_GRANTS_INVALID';
  END IF;

  FOR item_index IN 0..jsonb_array_length(enabled_modules) - 1 LOOP
    IF jsonb_typeof(enabled_modules -> item_index) <> 'string'
      OR jsonb_typeof(permission_values -> item_index) <> 'string' THEN
      RAISE EXCEPTION 'DS_M1B_GRANTS_INVALID';
    END IF;

    module_id := enabled_modules ->> item_index;
    permission_value := permission_values ->> item_index;
    IF char_length(module_id) NOT BETWEEN 1 AND 128
      OR char_length(permission_value) NOT BETWEEN 1 AND 128
      OR module_id ~ '[[:space:][:cntrl:]]'
      OR permission_value ~ '[[:space:][:cntrl:]]'
      OR module_id NOT IN (
        'spaceos.crm', 'spaceos.controlling', 'spaceos.hr',
        'spaceos.maintenance', 'spaceos.qa', 'spaceos.ehs', 'spaceos.dms',
        'joinerytech.door', 'joinerytech.plant'
      )
      OR left(permission_value, char_length(module_id) + 1) <> module_id || '.' THEN
      RAISE EXCEPTION 'DS_M1B_GRANTS_INVALID';
    END IF;

    action_value := substring(permission_value FROM char_length(module_id) + 2);
    IF action_value NOT IN ('view', 'edit', 'admin')
      OR permission_value <> module_id || '.' || action_value
      OR (previous_module_id IS NOT NULL AND (
        previous_module_id >= module_id OR previous_permission_value >= permission_value
      )) THEN
      RAISE EXCEPTION 'DS_M1B_GRANTS_INVALID';
    END IF;

    IF module_id = 'joinerytech.door' THEN
      doorstar_grant_count := doorstar_grant_count + 1;
      derived_capability := action_value::"DoorstarSessionCapability";
    END IF;
    previous_module_id := module_id;
    previous_permission_value := permission_value;
  END LOOP;

  IF doorstar_grant_count <> 1 OR derived_capability IS NULL THEN
    RAISE EXCEPTION 'DS_M1B_GRANTS_INVALID';
  END IF;
  RETURN derived_capability;
END;
$$;

CREATE FUNCTION doorstar_m1b_enforce_evidence_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status "DoorstarTenantBindingStatus";
  current_binding_version BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'DS_M1B_EVIDENCE_APPEND_ONLY';
  END IF;

  -- Audit time is database-owned; an INSERT-capable caller cannot backdate or
  -- predate an immutable evidence row by supplying its own createdAt value.
  NEW."createdAt" := clock_timestamp();

  SELECT "status", "bindingVersion"
    INTO current_status, current_binding_version
    FROM "DoorstarInstanceTenantBinding"
    WHERE "id" = NEW."tenantBindingId"
      AND "tenantId" = NEW."tenantId"
    FOR SHARE;
  IF NOT FOUND
    OR current_status <> 'ACTIVE'
    OR current_binding_version <> NEW."bindingVersion" THEN
    RAISE EXCEPTION 'DS_M1B_EVIDENCE_BINDING_INVALID';
  END IF;

  PERFORM doorstar_m1b_derive_capability(NEW."enabledModules", NEW."permissions");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DoorstarEvidence_lifecycle_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "IdentityAuthorityEvidence"
  FOR EACH ROW EXECUTE FUNCTION doorstar_m1b_enforce_evidence_lifecycle();

CREATE FUNCTION doorstar_m1b_enforce_session_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_subject TEXT;
  evidence_binding_version BIGINT;
  evidence_issued_seconds BIGINT;
  evidence_issued_nanos INTEGER;
  evidence_expires_seconds BIGINT;
  evidence_expires_nanos INTEGER;
  binding_status "DoorstarTenantBindingStatus";
  binding_version BIGINT;
  expected_capability "DoorstarSessionCapability";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DS_M1B_SESSION_DELETE_FORBIDDEN';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."revokedAt" IS NOT NULL OR NEW."revokeReason" IS NOT NULL
      OR NEW."lastValidatedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'DS_M1B_SESSION_INITIAL_STATE_INVALID';
    END IF;
    -- Same database-owned audit boundary as immutable evidence.
    NEW."createdAt" := clock_timestamp();

    SELECT
      evidence."subject",
      evidence."bindingVersion",
      evidence."tokenIssuedAtEpochSeconds",
      evidence."tokenIssuedAtNanoseconds",
      evidence."tokenExpiresAtEpochSeconds",
      evidence."tokenExpiresAtNanoseconds",
      binding."status",
      binding."bindingVersion"
      INTO evidence_subject, evidence_binding_version,
        evidence_issued_seconds, evidence_issued_nanos,
        evidence_expires_seconds, evidence_expires_nanos,
        binding_status, binding_version
      FROM "IdentityAuthorityEvidence" AS evidence
      INNER JOIN "DoorstarInstanceTenantBinding" AS binding
        ON binding."id" = evidence."tenantBindingId"
      WHERE evidence."id" = NEW."evidenceId"
        AND evidence."tenantBindingId" = NEW."tenantBindingId"
      FOR SHARE OF binding;
    IF NOT FOUND
      OR binding_status <> 'ACTIVE'
      OR NEW."subject" <> evidence_subject
      OR NEW."bindingVersion" <> evidence_binding_version
      OR NEW."bindingVersion" <> binding_version THEN
      RAISE EXCEPTION 'DS_M1B_SESSION_EVIDENCE_INVALID';
    END IF;

    SELECT doorstar_m1b_derive_capability("enabledModules", "permissions")
      INTO expected_capability
      FROM "IdentityAuthorityEvidence"
      WHERE "id" = NEW."evidenceId"
        AND "tenantBindingId" = NEW."tenantBindingId";
    IF NEW."capability" <> expected_capability
      OR (NEW."issuedAtEpochSeconds", NEW."issuedAtNanoseconds")
        < (evidence_issued_seconds, evidence_issued_nanos)
      OR (NEW."expiresAtEpochSeconds", NEW."expiresAtNanoseconds")
        > (evidence_expires_seconds, evidence_expires_nanos) THEN
      RAISE EXCEPTION 'DS_M1B_SESSION_EVIDENCE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."sessionSelector" IS DISTINCT FROM OLD."sessionSelector"
    OR NEW."verifierMacKeyVersion" IS DISTINCT FROM OLD."verifierMacKeyVersion"
    OR NEW."verifierMac" IS DISTINCT FROM OLD."verifierMac"
    OR NEW."csrfMacKeyVersion" IS DISTINCT FROM OLD."csrfMacKeyVersion"
    OR NEW."csrfMac" IS DISTINCT FROM OLD."csrfMac"
    OR NEW."stateMacKeyVersion" IS DISTINCT FROM OLD."stateMacKeyVersion"
    OR NEW."stateMac" IS DISTINCT FROM OLD."stateMac"
    OR NEW."tenantBindingId" IS DISTINCT FROM OLD."tenantBindingId"
    OR NEW."evidenceId" IS DISTINCT FROM OLD."evidenceId"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."capability" IS DISTINCT FROM OLD."capability"
    OR NEW."bindingVersion" IS DISTINCT FROM OLD."bindingVersion"
    OR NEW."issuedAtWire" IS DISTINCT FROM OLD."issuedAtWire"
    OR NEW."issuedAtEpochSeconds" IS DISTINCT FROM OLD."issuedAtEpochSeconds"
    OR NEW."issuedAtNanoseconds" IS DISTINCT FROM OLD."issuedAtNanoseconds"
    OR NEW."expiresAtWire" IS DISTINCT FROM OLD."expiresAtWire"
    OR NEW."expiresAtEpochSeconds" IS DISTINCT FROM OLD."expiresAtEpochSeconds"
    OR NEW."expiresAtNanoseconds" IS DISTINCT FROM OLD."expiresAtNanoseconds"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'DS_M1B_SESSION_IMMUTABLE';
  END IF;

  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'DS_M1B_SESSION_REVOKED_IMMUTABLE';
  END IF;
  IF NEW."revokedAt" IS NULL THEN
    IF NEW."revokeReason" IS NOT NULL
      OR NEW."lastValidatedAt" IS NULL
      OR (OLD."lastValidatedAt" IS NOT NULL AND NEW."lastValidatedAt" <= OLD."lastValidatedAt") THEN
      RAISE EXCEPTION 'DS_M1B_SESSION_VALIDATION_NOT_MONOTONIC';
    END IF;
    RETURN NEW;
  END IF;

  IF char_length(NEW."revokeReason") NOT BETWEEN 1 AND 256
    OR NEW."revokeReason" IS NULL
    OR btrim(NEW."revokeReason") <> NEW."revokeReason"
    OR NEW."lastValidatedAt" IS DISTINCT FROM OLD."lastValidatedAt" THEN
    RAISE EXCEPTION 'DS_M1B_SESSION_REVOKE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

-- Install this state machine before the binding-disable trigger. The latter's
-- atomic session revocation is intentionally validated by this same function.
CREATE TRIGGER "DoorstarSession_lifecycle_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "DoorstarSession"
  FOR EACH ROW EXECUTE FUNCTION doorstar_m1b_enforce_session_lifecycle();

CREATE FUNCTION doorstar_m1b_enforce_binding_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ACTIVE'
      OR NEW."bindingVersion" <> 1
      OR NEW."disabledAt" IS NOT NULL
      OR NEW."disabledReason" IS NOT NULL THEN
      RAISE EXCEPTION 'DS_M1B_BINDING_INITIAL_STATE_INVALID';
    END IF;
    -- Binding creation is an audited provisioning event, never caller-dated.
    NEW."createdAt" := clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DS_M1B_BINDING_DELETE_FORBIDDEN';
  END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'DS_M1B_BINDING_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD."status" <> 'ACTIVE'
    OR NEW."status" <> 'DISABLED'
    OR NEW."bindingVersion" <> OLD."bindingVersion" + 1
    OR NEW."disabledReason" IS NULL
    OR char_length(NEW."disabledReason") NOT BETWEEN 1 AND 256
    OR btrim(NEW."disabledReason") <> NEW."disabledReason" THEN
    RAISE EXCEPTION 'DS_M1B_BINDING_TRANSITION_INVALID';
  END IF;

  -- Use database time rather than a caller-owned timestamp for the audited
  -- lifecycle transition, then revoke active sessions in the same transaction.
  NEW."disabledAt" := clock_timestamp();
  UPDATE "DoorstarSession"
    SET "revokedAt" = clock_timestamp(),
        "revokeReason" = 'binding_disabled'
    WHERE "tenantBindingId" = OLD."id"
      AND "revokedAt" IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DoorstarBinding_lifecycle_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "DoorstarInstanceTenantBinding"
  FOR EACH ROW EXECUTE FUNCTION doorstar_m1b_enforce_binding_lifecycle();

-- Row triggers do not fire for TRUNCATE. Install a statement-level guard on
-- every control-plane table, then mark all guards ALWAYS so a normal session
-- cannot bypass them with session_replication_role. Owner/superuser separation
-- remains a separate hard trial preflight requirement.
CREATE FUNCTION doorstar_m1b_reject_control_plane_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'DS_M1B_CONTROL_PLANE_TRUNCATE_FORBIDDEN';
END;
$$;

CREATE TRIGGER "DoorstarBinding_truncate_guard"
  BEFORE TRUNCATE ON "DoorstarInstanceTenantBinding"
  FOR EACH STATEMENT EXECUTE FUNCTION doorstar_m1b_reject_control_plane_truncate();
CREATE TRIGGER "DoorstarEvidence_truncate_guard"
  BEFORE TRUNCATE ON "IdentityAuthorityEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION doorstar_m1b_reject_control_plane_truncate();
CREATE TRIGGER "DoorstarSession_truncate_guard"
  BEFORE TRUNCATE ON "DoorstarSession"
  FOR EACH STATEMENT EXECUTE FUNCTION doorstar_m1b_reject_control_plane_truncate();

-- Bind every cross-table trigger function to the schema in which this forward-
-- only migration was applied. pg_catalog must be first so an untrusted CREATE
-- principal cannot shadow a builtin; pg_temp is explicit and last so it cannot
-- shadow a trusted control-plane table.
DO $$
DECLARE
  target_schema TEXT := pg_catalog.current_schema();
BEGIN
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %I.doorstar_m1b_derive_capability(jsonb, jsonb) SET search_path TO pg_catalog, %I, pg_temp',
    target_schema, target_schema
  );
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %I.doorstar_m1b_enforce_evidence_lifecycle() SET search_path TO pg_catalog, %I, pg_temp',
    target_schema, target_schema
  );
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %I.doorstar_m1b_enforce_session_lifecycle() SET search_path TO pg_catalog, %I, pg_temp',
    target_schema, target_schema
  );
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %I.doorstar_m1b_enforce_binding_lifecycle() SET search_path TO pg_catalog, %I, pg_temp',
    target_schema, target_schema
  );
END;
$$;

ALTER TABLE "DoorstarInstanceTenantBinding"
  ENABLE ALWAYS TRIGGER "DoorstarBinding_lifecycle_guard";
ALTER TABLE "DoorstarInstanceTenantBinding"
  ENABLE ALWAYS TRIGGER "DoorstarBinding_truncate_guard";
ALTER TABLE "IdentityAuthorityEvidence"
  ENABLE ALWAYS TRIGGER "DoorstarEvidence_lifecycle_guard";
ALTER TABLE "IdentityAuthorityEvidence"
  ENABLE ALWAYS TRIGGER "DoorstarEvidence_truncate_guard";
ALTER TABLE "DoorstarSession"
  ENABLE ALWAYS TRIGGER "DoorstarSession_lifecycle_guard";
ALTER TABLE "DoorstarSession"
  ENABLE ALWAYS TRIGGER "DoorstarSession_truncate_guard";
