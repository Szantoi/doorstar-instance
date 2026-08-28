# Doorstar pilot — OIDC client compatibility contract

This is a source contract and Gate 2 review aid. It is **not** an instruction
to create or change an IdP client. Every IdP, secret-store, listener, ingress
or deployment action requires the separately recorded human approval defined
in [OPERATIONS-RELEASE-GATE.md](OPERATIONS-RELEASE-GATE.md).

## Exact BFF contract

The isolated pilot BFF accepts only the following browser callback:

```text
GET https://{approved-origin}/auth/callback?code={one-value}&state={one-value}
```

- The registered redirect URI must be HTTPS and exactly equal
  `DOORSTAR_PILOT_PUBLIC_ORIGIN` plus `/auth/callback`. It has no query string
  or fragment.
- `code` and `state` must each occur once and be non-empty.
- The callback does not accept `response_mode=form_post`, a fragment, or extra
  query fields such as `session_state`, `iss`, `scope`, `error`,
  `error_description` or `error_uri`.
- The BFF creates the authorization request itself: `response_type=code`,
  state, nonce and PKCE S256 are server generated. The browser never supplies
  a role, scope, actor, station or bearer token as authority.

An unknown or duplicate callback field produces HTTP 400. Do not use a proxy,
rewrite rule or browser script to hide it; request a separately reviewed source
change if the provider cannot emit the exact contract.

## IdP profile to review at Gate 2

The human-approved client review must show, without recording credentials or
user data:

1. A confidential server-side authorization-code client with client
   authentication and PKCE S256 support.
2. One exact HTTPS redirect URI, with no wildcard callback path or origin.
3. Standard authorization-code flow enabled; no implicit flow, password grant
   or browser token handoff is required by this BFF.
4. The configured issuer, authorization endpoint, token endpoint and JWKS URL
   match the approved BFF configuration; the ID-token signature algorithm is
   an approved asymmetric entry in `DOORSTAR_PILOT_OIDC_ID_TOKEN_ALGORITHMS`.
5. The final provider redirect contains only the parameter names `code` and
   `state`. Evidence records names and outcome only—never their values.

For Keycloak, its documentation notes that it may add `session_state` to the
authentication response and provides the per-client **Exclude Session State
From Authentication Response** compatibility setting. If the selected Keycloak
version exposes this behavior, the approved Gate 2 client review must confirm
that the field is excluded; the Doorstar BFF intentionally does not accept it.
See the [official Keycloak compatibility guidance](https://www.keycloak.org/docs/latest/upgrading/).

## Configuration example boundary

The BFF [`.env.example`](../../../src/doorstar-pilot-bff/.env.example) contains
only syntactically safe placeholders. In particular:

```dotenv
DOORSTAR_PILOT_PUBLIC_ORIGIN=https://doorstar.example.invalid
DOORSTAR_PILOT_OIDC_REDIRECT_URI=https://doorstar.example.invalid/auth/callback
```

Real values, client secrets, key material, tokens, authorization codes,
subjects and cookies belong only in the approved secret/configuration mechanism
and must never be placed in source control or Gate evidence.

## Historical Keycloak material

[`docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`](../KEYCLOAK_DOORSTAR_CONFIG.md)
describes the retired SpaceOS/Kernel soft launch. It uses a legacy audience,
password-grant examples and group/realm-role claims that are incompatible with
the isolated pilot. It is historical reference material only and must not be
used to activate the pilot.
