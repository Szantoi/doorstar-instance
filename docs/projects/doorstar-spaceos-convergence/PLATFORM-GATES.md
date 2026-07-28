# Doorstar convergence — JoineryTech platform gate-ek

Ezeket a taskokat kizárólag conductor vagy root zárhatja. A „kész a másik
repóban” állítás önmagában nem bizonyíték: artifact-verzió, commit, schema-hash,
tesztverdict és compatibility range szükséges.

## DSCONV-GATE-SECURITY

Kötelező JoineryTech input:

- `STAB-RLS-PROOF` done, nem-superuser tenant isolation bizonyítékkal;
- `ERPSEP-06` elfogadott Instance Context OpenAPI;
- JWT claim és tenant-resolution contract;
- auth/RLS hosting package pontos verziója;
- negative-path security teszt verdict.

Gate output a Doorstar tasknaplóban:

```yaml
platform_commit: <sha>
hosting_package: <id@version-or-digest>
instance_context_contract_sha256: <hash>
security_verdict: PASS
```

## DSCONV-GATE-INSTANCE

Kötelező JoineryTech input:

- `ERPSEP-02`: ModuleId + module manifest schema;
- `ERPSEP-03`: semleges reference és cross-module contract ADR;
- `ERPSEP-07`: brand/terminology/template/policy/adapter schema;
- `PROJECT-CORE-ADR`: Project/FlowEpic/StageChain/Production ownership;
- compatibility range és breaking-change policy.

Gate output:

```yaml
module_schema_sha256: <hash>
extension_schema_sha256: <hash>
project_contract_version: <version>
production_extension_decision: <adr-id>
verdict: PASS
```

## DSCONV-GATE-BUNDLE

Kötelező JoineryTech input:

- `ERPSEP-08`: tesztelt Module Bundle v1 és installer;
- `ERPSEP-09`: instance schema, lockfile, resolver és conformance runner;
- Maintenance pilot install/upgrade/rollback PASS;
- bundle signature trust root és rollback runbook.

Gate output:

```yaml
bundle_schema: spaceos.module/v1
instance_schema: spaceos.instance/v1
installer_digest: <digest>
conformance_runner_version: <version>
maintenance_pilot_verdict: PASS
verdict: PASS
```

## DSCONV-GATE-HANDSHAKE

Kötelező JoineryTech input:

- `PROJECT-CORE-ADR` Accepted ownership döntéssel;
- `B2B-09` PASS host/guest/attacker conformance bizonyítékkal;
- versioned Collaboration backend és frontend package/bundle;
- OpenAPI, event schema és terms schema pontos verziója és SHA-256 hash-e;
- nem-superuser participant-RLS security verdict;
- canonical terms/revision hash és replay/idempotency verdict;
- compatibility range és breaking-change policy.

Gate output:

```yaml
platform_commit: <sha>
collaboration_package: <id@version-or-digest>
openapi_sha256: <hash>
event_schema_sha256: <hash>
terms_schema_sha256: <hash>
conformance_runner: <version>
security_verdict: PASS
contract_verdict: PASS
e2e_verdict: PASS
verdict: PASS
```

A gate nem minősíti a platformot elektronikus aláírás-szolgáltatásnak, és nem
engedélyez valós partnerrel vagy valós szerződéssel végzett production pilotot.

## Stop / eszkaláció

- `latest`, lokális munkafa vagy dokumentálatlan artifact nem fogadható el.
- Hash- vagy verzióeltérésnél a gate marad `blocked`.
- Doorstar agent nem javíthatja a platform artifactot a Doorstar repositoryban.
- Külső registry-publikálás, deploy vagy signing-key változás emberi kapu.
- `DSCONV-GATE-HANDSHAKE` nem oldható fel lokális platform builddel vagy
  dokumentálatlan schema-verzióval.
