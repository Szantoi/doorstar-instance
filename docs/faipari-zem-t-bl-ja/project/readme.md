# Üzemi Tábla — Design System

Digitális műhelytábla faipari üzemeknek (egyedi ajtók, falpanelek, bútor). A vizuális nyelv egy valódi **filctollas fehér táblát** idéz: alu keret, fekete rácsvonalak, kézírásos feladatkártyák, filctoll-színkód. A "keretrendszer" (menük, táblázatok, gombok) ezzel szemben szikár, ipari, sötét-króm UI.

Élő termék-mock: `Uzemi Tabla.dc.html` (heti tábla, állomás-kanban, projektek + munkamenet-kiadás, terhelés monitor, munkalap modal).

## Index
- `styles.css` — belépési pont (importálja a tokeneket)
- `tokens/` — colors, typography, spacing, fonts
- `components/core/` — Button, StatusChip, TaskCard, Panel
- `guidelines/` — specimen kártyák (Design System fül)
- `SKILL.md` — agent skill

## CONTENT FUNDAMENTALS
- Nyelv: **magyar**, tegező-utasító a gomboknál ("Felveszem", "Kiadás", "Visszavon", "Betölt"), tárgyilagos a címkéknél ("Munkalap", "Tervezett nap").
- Műhelyzsargon megtartva: epik, task helyett magyarul folyamatsor/lépés/feladat; "Szabad feladat" = állomáshoz nem rendelt; rövidítések mint a valódi táblán ("megj.", "hi:", "ó/db", "db").
- Feladat címformátum: `Megrendelő Munkaszám — Epik · Lépés` (pl. "Koroknai 25168 — Tok 22-es · Fújás"). Sürgős: `!!` előtag + aláhúzás.
- Nincs emoji. Státuszjel: ✓ (kész), ✎ (új feladat felírása).
- Hosszabb magyarázatok apró szürke sorban a nézet alján ("jelmagyarázat" stílus).

## VISUAL FOUNDATIONS
- **Két réteg**: (1) a "tábla" — fehér `--surface-board`, fekete 2-3px rácsvonalak, kézírás; (2) a "keret" — sötét `--chrome-bg` fejléc, ipari UI Barlow Semi Condensed-del.
- **Színek**: a tartalom színe = státusz. Narancs = kiosztva/nincs felvéve, kék = felvett/folyamatban, zöld = kész (✓, 75% opacitás), piros = probléma. A piros SOHA nem dekoráció, csak baj.
- **Tipográfia**: Caveat (kézírás) mindenre, amit "ember írt a táblára"; Barlow Semi Condensed mindenre, ami "nyomtatott/gyári". Címkék: 12px, uppercase, +1px betűköz, `--text-muted`.
- **Sarkok**: a tábla és a panelek szögletesek (0px); csak gombok/chipek kapnak 3-4px rádiuszt.
- **Keretek**: panelek 2px fekete kerettel + `--shadow-panel`; a tábla alu kerete linear-gradient (`--surface-frame-hi`→`--surface-frame-lo`).
- **Kártyák**: nincs kártya-doboz! A feladat maga a kézírás, enyhe random dőléssel (±0.8°, id-hash alapján), szín = státusz.
- **Hover**: fehér→fekete invert (gombok), halvány→élénk szín (ikonok). Nincs animáció, nincs átmenet — azonnali, mint egy tábla.
- **Háttér**: `--surface-desk` semleges szürkésbézs; a mai nap oszlopfejléce `--surface-today` sárga.
- **Terhelés hőtérkép**: zöld/sárga/piros cellák (`--load-*`), túlterhelt cella 2px piros keretet kap.
- Nyomtatás: fehér lap nézetek `no-print` osztályú krómmal — a lap önmagában nyomtatható.

## ICONOGRAPHY
Nincs ikonkészlet és nincs logó (a forrás nem tartalmazott — szöveges "ÜZEMI TÁBLA" felirat áll a márkajel helyén). Unicode karakterek ikonként: ✓ ✎ ‹ › × !!. Új ikon igény esetén unicode vagy szöveg, ne SVG-rajz.

## Intentional additions
- StatusChip, TaskCard, Panel, Button komponensek: a DC-mockból desztillált primitívek, mert a forrás egyetlen élő HTML-mock.
