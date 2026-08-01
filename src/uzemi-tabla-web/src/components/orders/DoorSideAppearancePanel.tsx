import { useId } from "react";
import { observeDoorSideAppearance } from "../../lib/doorSideAppearance";

interface DoorSideAppearancePanelProps {
  surface: string | null;
  legacyFinishLabel?: string | null;
  wallDepthMm?: number | null;
  context: "SURVEY" | "TECHNICAL" | "SUMMARY";
}

const contextCopy = {
  SURVEY: "A felmérésben azt kell tisztázni, melyik helyiség látható az A és B oldal felől, és mekkora a kész fal. A tokborítás szerepét a rendszer nem találja ki.",
  TECHNICAL: "A végleges kiosztáshoz előbb meg kell határozni a tokrendszert és azt, van-e tokborítás az adott oldalon. Ezután adható meg a szerepe és felületkezelése.",
  SUMMARY: "Csak az ellenőrzött, A/B oldalhoz rendelt adat számít véglegesnek. Az örökölt forrásértékek lent külön, kiosztatlan jelöltként látszanak.",
} as const;

const appearanceTargets = [
  { component: "Ajtólapfelület", scope: "SIDE_A", applicability: "Alkalmazandó", tone: "base" },
  { component: "Ajtólapfelület", scope: "SIDE_B", applicability: "Alkalmazandó", tone: "base" },
  { component: "Látható tokszerkezeti felület", scope: "Teljes tokrendszer", applicability: "Absztrakt cél", tone: "base" },
  { component: "Tokborítás", scope: "SIDE_A", applicability: "Jelenlét feloldatlan", tone: "conditional" },
  { component: "Tokborítás", scope: "SIDE_B", applicability: "Jelenlét feloldatlan", tone: "conditional" },
] as const;

const physicalSides = [
  { key: "SIDE_A", label: "A oldal", viewLabel: "Az egyik helyiség felőli nézet" },
  { key: "SIDE_B", label: "B oldal", viewLabel: "A másik helyiség felőli nézet" },
] as const;

/** Compact, read-only door appearance summary. Legacy role-labelled fragments
 * remain source candidates and are never rendered inside either physical-side
 * card, because FIXED/ADJUSTABLE casing roles do not identify SIDE_A/SIDE_B. */
export function DoorSideAppearancePanel({
  surface,
  legacyFinishLabel = null,
  wallDepthMm = null,
  context,
}: DoorSideAppearancePanelProps) {
  const titleId = useId();
  const sourceTitleId = useId();
  const observation = observeDoorSideAppearance(surface);
  const hasSource = Boolean(legacyFinishLabel || observation.sourceValue);
  const candidateComparison = observation.roleCandidatesDiffer == null
    ? null
    : observation.roleCandidatesDiffer
      ? "A két forrásjelölt felülete eltér."
      : "A két forrásjelölt felülete azonos.";

  return <section className="door-side-appearance" aria-labelledby={titleId}>
    <header className="door-side-appearance-summary-header">
      <div>
        <span>Felületkezelési áttekintés</span>
        <h4 id={titleId}>Az ajtó két oldalának felületkezelése</h4>
        <p>Az <b>A oldal (SIDE_A)</b> és a <b>B oldal (SIDE_B)</b> azt jelölik, melyik helyiség felől nézzük az ajtót. A Doorstar örökölt forrásában a <b>FIX</b> és <b>ÁLLÍTHATÓ</b> nem az ajtó két oldala, hanem a tokborítás szerepe.</p>
      </div>
      <b className={hasSource ? "is-source" : "is-empty"}>{hasSource ? "Forrásjelöltek vannak" : "Nincs forrásérték"}</b>
    </header>

    <p className="door-side-appearance-context-note">{contextCopy[context]}</p>

    <div className="door-side-appearance-side-cards" aria-label="A két helyiség felőli nézet">
      {physicalSides.map((side) => {
        const sideTitleId = `${titleId}-${side.key}`;
        return <article className="door-side-appearance-side-card" aria-labelledby={sideTitleId} key={side.key}>
          <header className="door-side-appearance-side-card-header">
            <span>{side.key}</span>
            <div>
              <h5 id={sideTitleId}>{side.label}</h5>
              <p>{side.viewLabel}</p>
            </div>
          </header>
          <dl>
            <div><dt>Helyiség</dt><dd>Nincs még hozzárendelve</dd></div>
            <div><dt>Ajtólap felületkezelése</dt><dd>Nincs még ehhez az oldalhoz rendelve</dd></div>
            <div><dt>Tokborítás</dt><dd><span className="door-side-state is-unresolved">Még nincs eldöntve, van-e ezen az oldalon</span></dd></div>
            <div><dt>Tokborítás szerepe</dt><dd>A tokborítás megléte után adható meg</dd></div>
          </dl>
        </article>;
      })}
    </div>

    {hasSource && <section className="door-side-appearance-source-candidates" aria-labelledby={sourceTitleId}>
      <header>
        <div>
          <span>Örökölt forrás · nincs A/B oldalhoz rendelve</span>
          <h5 id={sourceTitleId}>A forrásban talált felületkezelések</h5>
        </div>
        {candidateComparison && <b className="door-side-appearance-source-comparison">{candidateComparison}</b>}
      </header>
      <div className="door-side-appearance-source-candidate-cards">
        {legacyFinishLabel && <article className="door-side-appearance-source-candidate-card">
          <span>Átmeneti katalógusérték</span>
          <strong>{legacyFinishLabel}</strong>
          <small>Összevont érték; nincs oldalhoz vagy komponenshez rendelve.</small>
        </article>}
        {observation.finishSystem && <article className="door-side-appearance-source-candidate-card">
          <span>Örökölt felülettípus</span>
          <strong>{observation.finishSystem}</strong>
          <small>Forrásleírás; még nem végleges felületkezelés.</small>
        </article>}
        {observation.fixedRoleSurfaceCandidate && <article className="door-side-appearance-source-candidate-card is-role-candidate">
          <span>Forráscímke: FIX tokborítás</span>
          <strong>{observation.fixedRoleSurfaceCandidate}</strong>
          <small>Kiosztatlan jelölt; nem jelenti automatikusan a SIDE_A vagy SIDE_B oldalt.</small>
        </article>}
        {observation.adjustableRoleSurfaceCandidate && <article className="door-side-appearance-source-candidate-card is-role-candidate">
          <span>Forráscímke: ÁLLÍTHATÓ tokborítás</span>
          <strong>{observation.adjustableRoleSurfaceCandidate}</strong>
          <small>A „mozgó” örökölt elnevezés; a jelölt nincs fizikai oldalhoz rendelve.</small>
        </article>}
        {observation.sourceValue && !observation.fixedRoleSurfaceCandidate && !observation.adjustableRoleSurfaceCandidate && <article className="door-side-appearance-source-candidate-card is-collapsed-source">
          <span>Összevont forrásérték</span>
          <strong>{observation.sourceValue}</strong>
          <small>Nem osztható szét automatikusan ajtólap-, tok- vagy tokborítás-felületre.</small>
        </article>}
      </div>
      <p className="door-side-appearance-source-warning">A forráscímke önmagában nem bizonyít tokborítás-alkatrészt, és nem mondja meg, melyik helyiség felőli oldalhoz tartozik.</p>
    </section>}

    <details className="door-side-appearance-technical-details">
      <summary>Mit kell még műszakilag eldönteni?</summary>
      <div className="door-side-appearance-facts">
        <div>
          <span>Kész falvastagság · örökölt mérés</span>
          <strong>{wallDepthMm != null ? `${wallDepthMm} mm` : "Nincs rögzítve"}</strong>
          <small>Nem azonos a tok falvastagsági tartományával vagy a szükséges beállítással.</small>
        </div>
        <div>
          <span>Tokprofil és tokborítás-kiosztás</span>
          <strong>Feloldatlan</strong>
          <small>A profil igazolja a tokborítás jelenlétét, szerepét és fizikai oldalát.</small>
        </div>
        <div>
          <span>Pánt, oldalasság és nyitási tér</span>
          <strong>Külön műszaki adatok</strong>
          <small>Ezek egyike sem vezethető le a tokborítás szerepéből.</small>
        </div>
      </div>

      <section className="door-side-appearance-components">
        <header>
          <div>
            <strong>Lehetséges megjelenési célok</strong>
            <p>Az alkalmazhatóságot a verziózott tokprofilnak és a backend-authoritynak kell meghatároznia.</p>
          </div>
          <b>Strukturált API szükséges</b>
        </header>
        <div
          className="door-side-appearance-table-wrap"
          role="region"
          tabIndex={0}
          aria-label="Megjelenési célok táblázata; keskeny képernyőn oldalirányban görgethető"
        >
          <table aria-label="Lehetséges megjelenési célok és műszaki állapotuk">
            <thead><tr><th scope="col">Megjelenési cél</th><th scope="col">Hatókör</th><th scope="col">Alkalmazhatóság</th><th scope="col">Effektív felület / szín</th></tr></thead>
            <tbody>{appearanceTargets.map((target) => <tr key={`${target.component}-${target.scope}`}>
              <th scope="row">{target.component}</th>
              <td data-label="Hatókör">{target.scope}</td>
              <td data-label="Alkalmazhatóság"><span className={target.tone === "conditional" ? "is-conditional" : "is-unresolved"}>{target.applicability}</span></td>
              <td data-label="Effektív felület / szín">{target.tone === "conditional" ? "Jelenlét igazolása után" : "Nincs strukturáltan rögzítve"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p>Az „azonos az ajtólappal” vagy „azonos a tokkal” is explicit, visszakövethető döntés. Ismeretlen komponens nem válhat automatikusan „nem alkalmazható” állapotúvá.</p>
      </section>
    </details>

    {observation.sourceValue && <details className="door-side-appearance-raw-source">
      <summary>Eredeti forrásérték megtekintése</summary>
      <code>{observation.sourceValue}</code>
    </details>}
  </section>;
}
