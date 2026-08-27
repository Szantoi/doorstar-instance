-- A-03 disposable proof fixture. This file is outside the production Prisma
-- lineage and is never imported by foundation, BFF or bootstrap packages.
--
-- The runner renders two fresh scope pairs into the eight placeholders before
-- application. The rendered SQL is intentionally a closed two-row fixture,
-- not a configuration mechanism. It may be applied only after both immutable
-- pilot migrations in a new disposable postgres:16 container.

CREATE OR REPLACE FUNCTION pilot.doorstar_require_pilot_write_context(
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

  -- A03_TWO_SCOPE_GUARD_START
  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 2
     OR (
       SELECT count(*)
         FROM pilot."PilotScope" AS configured_scope
         JOIN (
           VALUES
             ('__A03_SCOPE_A_ID__'::uuid, '__A03_SCOPE_A_KEY__'::varchar(80)),
             ('__A03_SCOPE_B_ID__'::uuid, '__A03_SCOPE_B_KEY__'::varchar(80))
         ) AS fixture_scope("id", "scopeKey")
           ON fixture_scope."id" = configured_scope."id"
          AND fixture_scope."scopeKey" = configured_scope."scopeKey"
     ) <> 2
     OR v_scope_id NOT IN (
       '__A03_SCOPE_A_ID__'::uuid,
       '__A03_SCOPE_B_ID__'::uuid
     ) THEN
    RAISE EXCEPTION 'A03 fixture requires exactly two closed configured scopes'
      USING ERRCODE = '23514';
  END IF;
  -- A03_TWO_SCOPE_GUARD_END

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

CREATE OR REPLACE FUNCTION pilot.pilot_runtime_preflight_v1()
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

  -- A03_TWO_SCOPE_GUARD_START
  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 2
     OR (
       SELECT count(*)
         FROM pilot."PilotScope" AS configured_scope
         JOIN (
           VALUES
             ('__A03_SCOPE_A_ID__'::uuid, '__A03_SCOPE_A_KEY__'::varchar(80)),
             ('__A03_SCOPE_B_ID__'::uuid, '__A03_SCOPE_B_KEY__'::varchar(80))
         ) AS fixture_scope("id", "scopeKey")
           ON fixture_scope."id" = configured_scope."id"
          AND fixture_scope."scopeKey" = configured_scope."scopeKey"
     ) <> 2
     OR v_scope_id NOT IN (
       '__A03_SCOPE_A_ID__'::uuid,
       '__A03_SCOPE_B_ID__'::uuid
     ) THEN
    RAISE EXCEPTION 'A03 fixture requires exactly two closed configured scopes'
      USING ERRCODE = '23514';
  END IF;
  -- A03_TWO_SCOPE_GUARD_END

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

CREATE OR REPLACE FUNCTION pilot.pilot_bootstrap_preflight_v1()
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

  -- A03_TWO_SCOPE_GUARD_START
  SELECT count(*) INTO v_scope_count FROM pilot."PilotScope";
  IF v_scope_count <> 2
     OR (
       SELECT count(*)
         FROM pilot."PilotScope" AS configured_scope
         JOIN (
           VALUES
             ('__A03_SCOPE_A_ID__'::uuid, '__A03_SCOPE_A_KEY__'::varchar(80)),
             ('__A03_SCOPE_B_ID__'::uuid, '__A03_SCOPE_B_KEY__'::varchar(80))
         ) AS fixture_scope("id", "scopeKey")
           ON fixture_scope."id" = configured_scope."id"
          AND fixture_scope."scopeKey" = configured_scope."scopeKey"
     ) <> 2
     OR v_scope_id NOT IN (
       '__A03_SCOPE_A_ID__'::uuid,
       '__A03_SCOPE_B_ID__'::uuid
     ) THEN
    RAISE EXCEPTION 'A03 fixture requires exactly two closed configured scopes'
      USING ERRCODE = '23514';
  END IF;
  -- A03_TWO_SCOPE_GUARD_END

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
