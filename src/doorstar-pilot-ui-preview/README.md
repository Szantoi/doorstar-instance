# Doorstar Office — helyi vizuális előnézet

Ez egy önálló, nulla függőséges statikus előnézet a Doorstar Office
bejelentkezési és áttekintő képernyőinek fejlesztés közbeni ellenőrzéséhez.
Nem importálja a BFF-et, nem olvas adatbázist, nem indít OIDC-folyamatot, és
nem tartalmaz hitelesítési megkerülést.

## Indítás

Node.js 20 vagy újabb verzióval:

~~~powershell
cd C:\Users\szant\Documents\Development\doorstar-pilot-foundation\src\doorstar-pilot-ui-preview
npm run dev
~~~

A szerver kizárólag a **127.0.0.1** loopback címen figyel, alapértelmezés szerint
a **4317** porton. Nyisd meg ezt a címet:

~~~text
http://127.0.0.1:4317
~~~

A jelenlegi projekt-részletező mintaútvonal:

~~~text
http://127.0.0.1:4317/office/projects/DS-26133
~~~

Ez kizárólag egy explicit helyi fixture: statikus képernyőt szolgál ki, nem
olvas projektet, fájlt vagy más adatforrást. Más projektazonosító vagy mélyebb
útvonal szándékosan 404 választ kap.

Másik helyi port állítható be a dedikált konfigurációs változóval:

~~~powershell
$env:DOORSTAR_UI_PREVIEW_PORT = 4318
npm run dev
~~~

A listener címe nem konfigurálható: szándékosan mindig **127.0.0.1**, ezért a
felületet nem lehet LAN-on vagy publikus hálózaton kiszolgálni ezzel a
szkripttel.

## Ellenőrzés

~~~powershell
npm run verify
~~~

Az ellenőrzés elindít egy rövid életű loopback szervert véletlen porton,
ellenőrzi a statikus előnézeti elemeket és a Content Security Policy-t, majd
leállítja. A próbált **/api/auth/start** útvonalnak 404-et kell adnia; ez
bizonyítja, hogy az előnézetben nincs hitelesítési útvonal.

## Tudatos korlátok

- A **Folytatás szervezeti fiókkal** gomb disabled, nincs eseménykezelője.
  A kártya az éles, szerveroldali OIDC authorization-code + PKCE folyamat
  megjelenítését mintázza; nincs saját e-mail- vagy jelszómező.
- A **Minta iroda megnyitása** gomb kizárólag a helyi `#dashboard` nézetre
  navigál. Nem hitelesít, nem tárol munkamenetet és nem oldja fel a valódi
  szervezeti belépés tiltását.
- A dashboard minden adata forráskódban deklarált, egyértelműen mintaadat.
- A dashboardról csak a szó szerint allowlistelt **DS-26133** helyi
  projekt-előnézet nyitható meg.
- A szerver csak öt explicit statikus útvonalat szolgál ki: **/**,
  **/index.html**, **/styles.css**, **/app.js** és a helyi
  **/office/projects/DS-26133** fixture. Nincs általános SPA fallback.
- A Content Security Policy **connect-src 'none'** beállítása nem enged sem
  API-, sem külső hálózati kapcsolatot.

Ez a felület nem a hitelesített alkalmazás helyettesítője. A valódi
bejelentkezés és adatkapcsolat csak a külön jóváhagyott Office runtime
integrációban kapcsolható be.
