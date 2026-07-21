# DSCONV-00 — Credential-rotációs végrehajtási terv

**Státusz:** `human_approval_required`  
**Scope:** Doorstar Knowledge Service futásidejű MCP credentialek  
**Tiltott automatikus lépés:** credential generálás, secrets-store írás,
production restart és régi érték revoke.

## Cél és leállási feltétel

A tracked dokumentáció nem tartalmaz credentialértéket. A régi futásidejű
értékek csak akkor vonhatók vissza, ha minden érintett kliens már az új,
secrets-store-ból betöltött értékkel működik, és a pozitív/negatív auth
ellenőrzés zöld. Leállás: bármely nem várt 401/403, reload-hiba vagy audit
anomália esetén rollback az előző, még nem visszavont credentialre.

## Előfeltételek

1. A Doorstar root/security kijelöli a secrets-store helyét és a rotáció
   végrehajtóját.
2. Leállási ablak és érintett MCP-kliensek listája jóváhagyott.
3. Friss, titkosított backup készül a futásidejű konfigurációról; az értéke
   nem kerül logba, chatbe vagy repositoryba.
4. A 3460-as szolgáltatás aktuális processz- és health-baseline-je rögzített.

## Jóváhagyott végrehajtási sorrend

1. Új, egyedi master- és terminálcredentialek létrehozása a secrets-store-ban.
2. A szolgáltatás konfigurációja kizárólag környezeti változókból/secrets-store
   adapterből tölt; repositoryban nincs új érték.
3. Stagingben reload/restart, majd érvényes és érvénytelen MCP-auth teszt.
4. Production cutover az emberi kapu után; health, auditlog és klienskapcsolat
   ellenőrzése.
5. Megfigyelési időszak után a régi értékek revoke-ja.
6. Értékkiírás nélküli repository- és dokumentációscan, majd evidence update.

## Rollback

Csak a régi credential revoke-ja előtt lehetséges. A secrets-store-beli előző
verzió visszaállítása után újra kell futtatni a health- és auth-smoke tesztet.
Revoke után új értéket kell kiadni; régi érték helyreállítása tilos.

## Elfogadási bizonyíték

- service health és a reload utáni PID/port ellenőrzés;
- pozitív és negatív MCP-auth verdict érték naplózása nélkül;
- auditlogban nincs auth-hibasorozat;
- a régi credentialek revoke-ja külön időbélyeggel igazolt;
- repository secret scan PASS.
