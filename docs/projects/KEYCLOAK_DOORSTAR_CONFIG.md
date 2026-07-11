# Keycloak Doorstar Tenant Configuration Specification

> **Version:** 1.0
> **Created:** 2026-07-08
> **Status:** SPECIFICATION (for TASK-DS-002, TASK-DS-003 implementation)
> **Reference:** `docs/knowledge/architecture/SpaceOS_Doorstar_Onboarding_v4.md` section 5

---

## 1. Prerequisites

- ✅ Keycloak `spaceos` realm exists (ProdReady Sprint artifact)
- ✅ JWT signing algorithm: ES256 (ECDSA P-256)
- ✅ Kernel JWT audience configured: `kernel-api`
- ❌ Doorstar group + users to be created (TASK-DS-001 verification → TASK-DS-002 implementation)

---

## 2. Doorstar Group Configuration

### 2.1 Group Creation

**Group Path:** `spaceos/doorstar`

**Group Attributes:**

| Attribute Name | Value | Type | Description |
|---|---|---|---|
| `tenant_id` | `{DOORSTAR_TENANT_UUID}` | String (UUID) | Unique tenant identifier (matches Kernel `Tenants` table) |
| `tenant_type` | `Manufacturer` | String | Tenant business type (enum: Manufacturer, Distributor, Installer) |
| `enabled_modules` | `["door"]` | JSON Array | Enabled SpaceOS modules (soft launch: Joinery only) |

**CRITICAL:** `tenant_id` MUST be a valid UUID format. Typo = silent auth failure (Finding DB-01 from v4 doc).

### 2.2 Protocol Mappers (Group Attribute → JWT Claim)

**3 protocol mappers required:**

| Mapper Name | Mapper Type | Group Attribute | Token Claim Name | Claim JSON Type | Add to ID Token | Add to Access Token | Add to Userinfo |
|---|---|---|---|---|---|---|---|
| `tenant_id` | `User Attribute` | `tenant_id` | `tenant_id` | String | ✅ | ✅ | ✅ |
| `tenant_type` | `User Attribute` | `tenant_type` | `tenant_type` | String | ✅ | ✅ | ✅ |
| `enabled_modules` | `User Attribute` | `enabled_modules` | `enabled_modules` | JSON | ✅ | ✅ | ✅ |

**Configuration Details:**
- **Mapper Protocol:** `openid-connect`
- **Full group path:** `true` (include parent groups)
- **Multivalued:** `false` (single value per claim)

---

## 3. Doorstar Users

### 3.1 User Definitions

| Username | Email | First Name | Last Name | Realm Role | Group Membership | Initial Password |
|---|---|---|---|---|---|---|
| `doorstar-admin` | `admin@doorstar.hu` | Doorstar | Admin | `Admin` | `spaceos/doorstar` | `{SECURE_RANDOM_32}` |
| `doorstar-op1` | `operator1@doorstar.hu` | Operator | 1 | `User` | `spaceos/doorstar` | `{SECURE_RANDOM_32}` |
| `doorstar-op2` | `operator2@doorstar.hu` | Operator | 2 | `User` | `spaceos/doorstar` | `{SECURE_RANDOM_32}` |

**Password Policy:**
- Minimum 12 characters
- At least 1 uppercase, 1 lowercase, 1 digit, 1 special character
- NOT a dictionary word
- Force change password on first login: `false` (UAT convenience)

### 3.2 Realm Roles

| Role Name | Description | Permissions |
|---|---|---|
| `Admin` | Tenant administrator | Full tenant data access (RLS enforced) |
| `User` | Standard operator | Read/write tenant data (RLS enforced) |

**IMPORTANT:** Keycloak admin console access restricted to `127.0.0.1` (Finding SEC-02). Cross-tenant escalation prevented by Kernel RLS (defense in depth).

---

## 4. JWT Token Structure (Expected Output)

### 4.1 Sample JWT Payload

```json
{
  "sub": "8c7a4f2e-3b9d-4e1a-9f5c-2d8e7b6a1c3f",
  "iss": "https://joinerytech.hu/auth/realms/spaceos",
  "aud": "kernel-api",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenant_type": "Manufacturer",
  "enabled_modules": ["door"],
  "allowed_hosts": [],
  "realm_access": {
    "roles": ["Admin"]
  },
  "email": "admin@doorstar.hu",
  "preferred_username": "doorstar-admin",
  "given_name": "Doorstar",
  "family_name": "Admin",
  "exp": 1720000000,
  "iat": 1719996400,
  "jti": "f8e7d6c5-b4a3-2190-8f7e-6d5c4b3a2109"
}
```

### 4.2 Claim Validation (TASK-DS-004)

**Integration test checklist:**

| Claim | Validation | Pass Criteria |
|---|---|---|
| `tenant_id` | UUID format | Matches `{DOORSTAR_TENANT_UUID}` |
| `tenant_type` | Enum value | `"Manufacturer"` |
| `enabled_modules` | JSON array | `["door"]` (Joinery module) |
| `allowed_hosts` | Array | `[]` (empty until B2B allowlist seed in TASK-DS-012) |
| `realm_access.roles` | Array | Contains `"Admin"` for doorstar-admin |
| `aud` | String | `"kernel-api"` |
| `iss` | URL | `https://joinerytech.hu/auth/realms/spaceos` |
| `exp` | Timestamp | Future timestamp (token not expired) |

---

## 5. Keycloak Admin API Integration (Implementation Guidance)

### 5.1 API Endpoints (for TASK-DS-002, TASK-DS-003)

**Base URL:** `https://joinerytech.hu/auth/admin/realms/spaceos`

**Authentication:** Admin API token (separate Keycloak admin credentials)

**Group Creation (TASK-DS-002):**
```bash
POST /groups
{
  "name": "doorstar",
  "attributes": {
    "tenant_id": ["{DOORSTAR_TENANT_UUID}"],
    "tenant_type": ["Manufacturer"],
    "enabled_modules": ["[\"door\"]"]
  }
}
```

**User Creation (TASK-DS-003):**
```bash
POST /users
{
  "username": "doorstar-admin",
  "email": "admin@doorstar.hu",
  "firstName": "Doorstar",
  "lastName": "Admin",
  "enabled": true,
  "credentials": [{
    "type": "password",
    "value": "{SECURE_RANDOM_32}",
    "temporary": false
  }],
  "realmRoles": ["Admin"],
  "groups": ["/doorstar"]
}
```

**Protocol Mapper Creation (TASK-DS-002):**
```bash
POST /clients/{kernel-api-client-id}/protocol-mappers/models
{
  "name": "tenant_id",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-usermodel-attribute-mapper",
  "config": {
    "user.attribute": "tenant_id",
    "claim.name": "tenant_id",
    "jsonType.label": "String",
    "id.token.claim": "true",
    "access.token.claim": "true",
    "userinfo.token.claim": "true"
  }
}
```

### 5.2 Validation Script (TASK-DS-004)

```bash
#!/bin/bash
# keycloak-doorstar-jwt-validation.sh

# 1. Authenticate as doorstar-admin
TOKEN=$(curl -s -X POST https://joinerytech.hu/auth/realms/spaceos/protocol/openid-connect/token \
  -d "client_id=kernel-api" \
  -d "username=doorstar-admin" \
  -d "password={SECURE_RANDOM_32}" \
  -d "grant_type=password" | jq -r '.access_token')

# 2. Decode JWT (base64 decode payload)
PAYLOAD=$(echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq)

# 3. Validate claims
TENANT_ID=$(echo $PAYLOAD | jq -r '.tenant_id')
TENANT_TYPE=$(echo $PAYLOAD | jq -r '.tenant_type')
ENABLED_MODULES=$(echo $PAYLOAD | jq -r '.enabled_modules')

echo "tenant_id: $TENANT_ID (expected: {DOORSTAR_TENANT_UUID})"
echo "tenant_type: $TENANT_TYPE (expected: Manufacturer)"
echo "enabled_modules: $ENABLED_MODULES (expected: [\"door\"])"

# 4. Call Kernel /api/health with JWT
curl -s -H "Authorization: Bearer $TOKEN" https://joinerytech.hu/bff/api/health | jq

# 5. Call Kernel /api/tenants/me
curl -s -H "Authorization: Bearer $TOKEN" https://joinerytech.hu/bff/api/tenants/me | jq
```

**Expected output:**
```json
{
  "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Doorstar Kft.",
  "tenantType": "Manufacturer",
  "enabledModules": ["door"],
  "isArchived": false
}
```

---

## 6. Security Considerations (from Doorstar v4 Findings)

### 6.1 Finding DB-01: UUID Validation
**Risk:** Manual UUID typo in `tenant_id` group attribute → silent auth failure
**Mitigation:**
- Seed script validates UUID format before Keycloak API call
- Kernel `TenantSessionInterceptor` logs warning if JWT `tenant_id` not in `Tenants` table

### 6.2 Finding SEC-02: Cross-Tenant Escalation
**Risk:** Keycloak admin can add user to any group → cross-tenant access
**Mitigation:**
- Keycloak admin console restricted to `127.0.0.1` (Nginx rule)
- Kernel RLS enforces tenant isolation (defense in depth)

### 6.3 Finding SEC-05: JWT Audience
**Decision:** Joinery API audience = `kernel-api` (same as Kernel)
**Rationale:** Soft launch, single VPS, internal network, simplified token management
**Future:** Separate Joinery audience when scaling to multi-VPS

---

## 7. Implementation Checklist (for Backend Terminal)

**TASK-DS-001 (Verification):**
- [ ] Keycloak `spaceos` realm exists
- [ ] JWT signing algorithm: ES256
- [ ] `kernel-api` client configured
- [ ] Escalate to Root if ANY prerequisite missing

**TASK-DS-002 (Group + Mappers):**
- [ ] Create `spaceos/doorstar` group
- [ ] Add 3 group attributes (tenant_id, tenant_type, enabled_modules)
- [ ] Validate `tenant_id` UUID format
- [ ] Create 3 protocol mappers (tenant_id, tenant_type, enabled_modules)
- [ ] Verify mappers add claims to ID/access/userinfo tokens
- [ ] Output: group config JSON + mapper config JSON

**TASK-DS-003 (Users):**
- [ ] Generate 3 secure random passwords (32 chars)
- [ ] Create 3 users (doorstar-admin, doorstar-op1, doorstar-op2)
- [ ] Assign users to `spaceos/doorstar` group
- [ ] Assign realm roles (Admin, User)
- [ ] Deliver credentials to Root (secure channel)
- [ ] Output: user creation log + credentials file (encrypted)

**TASK-DS-004 (JWT Validation):**
- [ ] Run keycloak-doorstar-jwt-validation.sh script
- [ ] Verify all claim values match expected
- [ ] Verify Kernel /api/health → 200 OK
- [ ] Verify Kernel /api/tenants/me → correct tenant metadata
- [ ] Screenshot JWT payload (decoded)
- [ ] Output: integration test report + JWT screenshot

---

**Deliverable:** Keycloak Doorstar tenant fully operational, JWT token validated, users can authenticate.

**Next Milestone:** M2-SEED (Kernel + Joinery database seed)
