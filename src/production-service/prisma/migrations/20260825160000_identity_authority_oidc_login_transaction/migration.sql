-- DSCONV-03 M2B: durable, one-time PKCE transaction state only.
-- It deliberately contains no authorization code, state, nonce, PKCE verifier,
-- access/ID/refresh token, client assertion, client secret or raw MAC key.

CREATE TABLE "DoorstarOidcLoginTransaction" (
  "id" TEXT NOT NULL,
  "selector" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL,
  "stateMacKeyVersion" INTEGER NOT NULL,
  "stateMac" BYTEA NOT NULL,
  "issuer" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "profileDigest" TEXT NOT NULL,
  "issuedAtWire" TEXT NOT NULL,
  "issuedAtEpochSeconds" BIGINT NOT NULL,
  "issuedAtNanoseconds" INTEGER NOT NULL,
  "expiresAtWire" TEXT NOT NULL,
  "expiresAtEpochSeconds" BIGINT NOT NULL,
  "expiresAtNanoseconds" INTEGER NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoorstarOidcLoginTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DoorstarOidcLoginTransaction_selector_key" UNIQUE ("selector"),
  CONSTRAINT "DoorstarOidcLoginTransaction_opaque_state_check" CHECK (
    -- A 32-byte unpadded base64url value has 43 characters and its final
    -- sextet carries only four source bits. Restrict that final character so
    -- alternate encodings of the same bytes cannot enter the control plane.
    "selector" ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    AND "keyVersion" >= 1
    AND "stateMacKeyVersion" >= 1
    AND octet_length("stateMac") = 32
    AND char_length("issuer") BETWEEN 1 AND 2048
    AND char_length("clientId") BETWEEN 1 AND 128
    AND "clientId" ~ '^[A-Za-z0-9._-]{1,128}$'
    AND char_length("redirectUri") BETWEEN 1 AND 2048
    AND char_length("profileDigest") = 43
    AND "profileDigest" ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
  ),
  CONSTRAINT "DoorstarOidcLoginTransaction_time_check" CHECK (
    "issuedAtNanoseconds" BETWEEN 0 AND 999999999
    AND "expiresAtNanoseconds" BETWEEN 0 AND 999999999
    AND ("expiresAtEpochSeconds", "expiresAtNanoseconds")
      > ("issuedAtEpochSeconds", "issuedAtNanoseconds")
    AND ("expiresAtEpochSeconds", "expiresAtNanoseconds")
      >= ("issuedAtEpochSeconds" + 1, "issuedAtNanoseconds")
    AND ("expiresAtEpochSeconds", "expiresAtNanoseconds")
      <= ("issuedAtEpochSeconds" + 600, "issuedAtNanoseconds")
    AND char_length("issuedAtWire") BETWEEN 1 AND 64
    AND char_length("expiresAtWire") BETWEEN 1 AND 64
    AND doorstar_m1b_exact_utc_triplet(
      "issuedAtWire", "issuedAtEpochSeconds", "issuedAtNanoseconds"
    )
    AND doorstar_m1b_exact_utc_triplet(
      "expiresAtWire", "expiresAtEpochSeconds", "expiresAtNanoseconds"
    )
  )
);

CREATE INDEX "DoorstarOidcLoginTransaction_consumedAt_expiresAt_idx"
  ON "DoorstarOidcLoginTransaction" (
    "consumedAt", "expiresAtEpochSeconds", "expiresAtNanoseconds"
  );

CREATE FUNCTION doorstar_m2b_enforce_oidc_transaction_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."consumedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'DS_M2B_OIDC_TRANSACTION_CONSUMED_ON_INSERT';
    END IF;
    NEW."createdAt" := clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DS_M2B_OIDC_TRANSACTION_DELETE_FORBIDDEN';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."selector" IS DISTINCT FROM OLD."selector"
    OR NEW."keyVersion" IS DISTINCT FROM OLD."keyVersion"
    OR NEW."stateMacKeyVersion" IS DISTINCT FROM OLD."stateMacKeyVersion"
    OR NEW."stateMac" IS DISTINCT FROM OLD."stateMac"
    OR NEW."issuer" IS DISTINCT FROM OLD."issuer"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."redirectUri" IS DISTINCT FROM OLD."redirectUri"
    OR NEW."profileDigest" IS DISTINCT FROM OLD."profileDigest"
    OR NEW."issuedAtWire" IS DISTINCT FROM OLD."issuedAtWire"
    OR NEW."issuedAtEpochSeconds" IS DISTINCT FROM OLD."issuedAtEpochSeconds"
    OR NEW."issuedAtNanoseconds" IS DISTINCT FROM OLD."issuedAtNanoseconds"
    OR NEW."expiresAtWire" IS DISTINCT FROM OLD."expiresAtWire"
    OR NEW."expiresAtEpochSeconds" IS DISTINCT FROM OLD."expiresAtEpochSeconds"
    OR NEW."expiresAtNanoseconds" IS DISTINCT FROM OLD."expiresAtNanoseconds"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'DS_M2B_OIDC_TRANSACTION_IMMUTABLE';
  END IF;

  IF OLD."consumedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'DS_M2B_OIDC_TRANSACTION_CONSUMED_IMMUTABLE';
  END IF;
  IF NEW."consumedAt" IS NULL THEN
    RAISE EXCEPTION 'DS_M2B_OIDC_TRANSACTION_CONSUMPTION_REQUIRED';
  END IF;

  NEW."consumedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DoorstarOidcLoginTransaction_lifecycle_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "DoorstarOidcLoginTransaction"
  FOR EACH ROW EXECUTE FUNCTION doorstar_m2b_enforce_oidc_transaction_lifecycle();

CREATE TRIGGER "DoorstarOidcLoginTransaction_truncate_guard"
  BEFORE TRUNCATE ON "DoorstarOidcLoginTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION doorstar_m1b_reject_control_plane_truncate();

ALTER TABLE "DoorstarOidcLoginTransaction"
  ENABLE ALWAYS TRIGGER "DoorstarOidcLoginTransaction_lifecycle_guard";
ALTER TABLE "DoorstarOidcLoginTransaction"
  ENABLE ALWAYS TRIGGER "DoorstarOidcLoginTransaction_truncate_guard";
