# DSCONV-03 — M2B identity boundary és issuance adapter

- **Állapot:** elkészült source-only security foundation; nem runtime-aktiválás
- **Dátum:** 2026-08-25
- **Kapcsolódó terv:** [DSCONV-03-M2B-BFF-SESSION-AND-CUTOVER-DESIGN.md](DSCONV-03-M2B-BFF-SESSION-AND-CUTOVER-DESIGN.md)

## Cél és nem-cél

Ez a slice lezárja a humán OIDC callback és az M1B evidence/session issuance
közötti forrásoldali trust-határt. Egyetlen, `evidence.ts`-ben élő
`createDoorstarIdentityBoundary(...)` composition root fogad genuine, PKCE-CAS
utáni claimed deliveryt. A teljes lánc token- és secretmentes eredményt ad a
hívónak.

Nem része a slice-nak a Keycloak HTTP token-hívás, route-mount, Express,
Set-Cookie HTTP válasz, globális Prisma client, adatbázis-kapcsolat vagy
migrációfuttatás. A létrejövő session még nem olvasható, validálható vagy
visszavonható ezen az adapteren keresztül.

## Zárt adatfolyam

```text
genuine claimed PKCE delivery
  -> profile-bound OIDC code-exchange source
  -> registered strict human JWT verifier
  -> private verified-human proof + fresh registered production resolver
  -> private evidence assembler
  -> opaque one-use issuance commit
  -> injected Prisma: evidence create + session create (egy tranzakció)
  -> future HTTP boundarynek átadott cookie-header terv
```

A nyers authorization code, verifier, nonce, access/ID token, evidence-proof,
session selector/verifier és CSRF nem része a public completionnek, nem kerül a
commitba és nem íródik adatbázisba. A completion csak `accepted`, illetve
statikus denied/unavailable kód.

## Trust-határok

- A PKCE, JWT és token-delivery capabilityk egyszer használhatók és
  module-owned WeakMap állapotúak.
- A boundary a JWT-verifiert csak a `verifyDoorstarHumanJwtAndConsume` bridge-en
  át használja. Strukturális `{ verifyAndConsume() {} }` helyettesítő nem
  juthat validált factshez.
- A friss Kernel authority revalidation csak a
  `resolveIdentityAuthorityClient` bridge-en át indul. Csak a production
  factory által létrehozott, fagyasztott kliens eredetileg bindolt művelete van
  regisztrálva; a dependency-injektált `ForTest` factory szándékosan nincs.
- A Prisma adapter nem kap public evidence/session DTO-t. A boundary egy
  példányra korlátozott opaque commit-consumert ad, amelyet csak a
  `consumeDoorstarTrustedIdentityAuthorityIssuanceCommit` bridge ismer fel.
  Strukturális commit vagy consumer esetén nem indul tranzakció.

## Perzisztencia-invariánsok

A boundary a HMAC-eket, session-expiryt és UUID-ket a tranzakción kívül képezi.
Az evidence UUID előre kiosztott, mert a session state-MAC az evidence ID-hoz
kötődik. Az adapter újra ellenőrzi a kanonikus, tokenmentes snapshotot és az
exact `min(access-exp, id-exp, configured-maximum)` expiryt, majd interactive
tranzakcióban először az immutable evidence-et, utána a sessiont hozza létre.
A második írás hibája ezért az evidence írást is rollbackeli.

A binding olvasás nem szűr `ACTIVE` státuszra: a private evidence assemblernek
külön kell elutasítania a disabled és a hiányzó bindingot. A későbbi
session read/validate/revoke nem került be, mert a `lastValidatedAt` és revoke
auditidő jelenlegi szerződése még nem database-owned.

## Aktiválási kapuk

Ez a source-only lezárás nem jogosít fel próbaüzemre. Az éles teszt előtt
külön, jóváhagyott slice-ban szükséges:

1. release-pinnelt Doorstar humán OIDC artifact, canonical `/auth/*` host és
   a tényleges bounded HTTP/form/client-auth/token-response adapter;
2. M1B és M2B explicit disposable DB migration proof;
3. runtime DB principal least-privilege preflight;
4. native audit actor döntés, atomikus BFF/frontend/resource cutover és Kernel
   release attestation;
5. külön jóváhagyott, izolált Keycloak–Kernel–Doorstar E2E.
