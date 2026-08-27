-- Isolated Doorstar named-user pilot foundation.
-- Source evidence only: this migration must never be applied to a historical,
-- shared, customer, Flow, Calculation, Plant, staging or production database
-- without the separate DBA/security change approval and disposable proof.

CREATE TYPE "PilotOfficeRole" AS ENUM (
  'SALES',
  'TECHNICAL_PREPARATION',
  'ORDER_APPROVER',
  'PRODUCTION_PLANNER',
  'INSTALLER',
  'WAREHOUSE_DISPATCH',
  'ADMINISTRATOR',
  'READER',
  'SHOP_FLOOR'
);

CREATE TYPE "BindingAuditAction" AS ENUM (
  'BOOTSTRAP_PROVISION',
  'DIRECT_ADMIN_UPDATE',
  'SESSION_REVOKED',
  'BINDING_DEACTIVATED',
  'BINDING_REACTIVATED'
);

CREATE TYPE "BindingAuditSource" AS ENUM ('BOOTSTRAP_CLI', 'DIRECT_ADMIN');

CREATE TABLE "PilotScope" (
  "id" UUID NOT NULL,
  "scopeKey" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthorizationTransaction" (
  "id" UUID NOT NULL,
  "stateHash" CHAR(64) NOT NULL,
  "browserBindingHash" CHAR(64) NOT NULL,
  "nonceHash" CHAR(64) NOT NULL,
  "codeVerifierCiphertext" BYTEA NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthorizationTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthorizationTransaction_expiry_after_create" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "PrincipalBinding" (
  "id" UUID NOT NULL,
  "pilotScopeId" UUID NOT NULL,
  "actorKey" CHAR(64) NOT NULL,
  "issuer" VARCHAR(2048) NOT NULL,
  "subjectDigest" CHAR(64) NOT NULL,
  "displayName" VARCHAR(160) NOT NULL,
  "role" "PilotOfficeRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "canManagePilotRoster" BOOLEAN NOT NULL DEFAULT false,
  "auditVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrincipalBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrincipalBinding_audit_version_positive" CHECK ("auditVersion" > 0)
);

CREATE TABLE "OpaqueSession" (
  "id" UUID NOT NULL,
  "pilotScopeId" UUID NOT NULL,
  "bindingId" UUID NOT NULL,
  "sessionTokenHash" CHAR(64) NOT NULL,
  "providerAccessTokenCiphertext" BYTEA,
  "bindingEpoch" INTEGER NOT NULL DEFAULT 1,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "OpaqueSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpaqueSession_epoch_positive" CHECK ("bindingEpoch" > 0),
  CONSTRAINT "OpaqueSession_expiry_after_issue" CHECK ("expiresAt" > "issuedAt")
);

CREATE TABLE "BindingAudit" (
  "id" UUID NOT NULL,
  "pilotScopeId" UUID NOT NULL,
  "bindingId" UUID NOT NULL,
  "actorBindingId" UUID,
  "action" "BindingAuditAction" NOT NULL,
  "source" "BindingAuditSource" NOT NULL,
  "previousRole" "PilotOfficeRole",
  "nextRole" "PilotOfficeRole",
  "previousActive" BOOLEAN,
  "nextActive" BOOLEAN,
  "previousCanManagePilotRoster" BOOLEAN,
  "nextCanManagePilotRoster" BOOLEAN,
  "reason" VARCHAR(500),
  "approvalReference" VARCHAR(160),
  "witnessTransactionId" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BindingAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotScope_scopeKey_key" ON "PilotScope"("scopeKey");
CREATE UNIQUE INDEX "AuthorizationTransaction_stateHash_key" ON "AuthorizationTransaction"("stateHash");
CREATE INDEX "AuthorizationTransaction_expiresAt_idx" ON "AuthorizationTransaction"("expiresAt");
CREATE UNIQUE INDEX "PrincipalBinding_scope_issuer_subject_key" ON "PrincipalBinding"("pilotScopeId", "issuer", "subjectDigest");
CREATE UNIQUE INDEX "PrincipalBinding_scope_actor_key" ON "PrincipalBinding"("pilotScopeId", "actorKey");
CREATE UNIQUE INDEX "PrincipalBinding_id_scope_key" ON "PrincipalBinding"("id", "pilotScopeId");
CREATE INDEX "PrincipalBinding_scope_active_idx" ON "PrincipalBinding"("pilotScopeId", "active");
CREATE UNIQUE INDEX "OpaqueSession_scope_token_key" ON "OpaqueSession"("pilotScopeId", "sessionTokenHash");
CREATE INDEX "OpaqueSession_binding_scope_lifecycle_idx" ON "OpaqueSession"("bindingId", "pilotScopeId", "revokedAt", "expiresAt");
CREATE INDEX "BindingAudit_binding_scope_created_idx" ON "BindingAudit"("bindingId", "pilotScopeId", "createdAt");
CREATE INDEX "BindingAudit_scope_created_idx" ON "BindingAudit"("pilotScopeId", "createdAt");

ALTER TABLE "PrincipalBinding"
  ADD CONSTRAINT "PrincipalBinding_scope_fkey"
  FOREIGN KEY ("pilotScopeId") REFERENCES "PilotScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpaqueSession"
  ADD CONSTRAINT "OpaqueSession_scope_fkey"
  FOREIGN KEY ("pilotScopeId") REFERENCES "PilotScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpaqueSession_binding_scope_fkey"
  FOREIGN KEY ("bindingId", "pilotScopeId") REFERENCES "PrincipalBinding"("id", "pilotScopeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BindingAudit"
  ADD CONSTRAINT "BindingAudit_scope_fkey"
  FOREIGN KEY ("pilotScopeId") REFERENCES "PilotScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BindingAudit_target_scope_fkey"
  FOREIGN KEY ("bindingId", "pilotScopeId") REFERENCES "PrincipalBinding"("id", "pilotScopeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BindingAudit_actor_scope_fkey"
  FOREIGN KEY ("actorBindingId", "pilotScopeId") REFERENCES "PrincipalBinding"("id", "pilotScopeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The pilot scope is a root identity boundary, never browser-selectable
-- configuration. Its lifecycle requires a separately approved data/DB action.
CREATE FUNCTION "doorstar_pilot_reject_scope_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pilot scope is immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "PilotScope_immutable"
BEFORE UPDATE OR DELETE ON "PilotScope"
FOR EACH ROW EXECUTE FUNCTION "doorstar_pilot_reject_scope_mutation"();

-- Audit evidence is append-only at the database boundary as well as in the
-- application model. Later A-phase writer routines may INSERT it, but cannot
-- alter or erase an already recorded transition.
CREATE FUNCTION "doorstar_pilot_reject_binding_audit_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pilot binding audit is append-only' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "BindingAudit_append_only"
BEFORE UPDATE OR DELETE ON "BindingAudit"
FOR EACH ROW EXECUTE FUNCTION "doorstar_pilot_reject_binding_audit_mutation"();
