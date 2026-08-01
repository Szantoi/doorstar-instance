import { useState } from "react";
import { componentSnapshotErrorMessage } from "@/lib/componentSnapshotErrors";
import type { ComponentRequirement, ComponentSnapshot, OrderRevisionStatus } from "@/services/production/types";

interface ComponentSnapshotsPanelProps {
  snapshots: ComponentSnapshot[];
  revisionStatus: OrderRevisionStatus;
  loading: boolean;
  error: boolean;
  canReview: boolean;
  pending: boolean;
  authorityReady: boolean;
  reviewContext: {
    approvedOrderContentHash: string;
    snapshotSchemaVersion: string;
    activeProfileVersions: string[];
  } | null;
  onReview: (snapshotId: string, state: "VERIFIED" | "REJECTED", resolution: string) => Promise<unknown>;
}

const snapshotStateLabel = {
  REVIEW: "Ellenőrzésre vár",
  VERIFIED: "Ellenőrzött",
  REJECTED: "Elutasított",
} as const;

function dimensions(requirement: ComponentRequirement, prefix: "finished" | "cutting") {
  const values = prefix === "finished"
    ? [requirement.finishedWidthMm, requirement.finishedHeightMm, requirement.finishedThicknessMm]
    : [requirement.cuttingWidthMm, requirement.cuttingHeightMm, requirement.cuttingThicknessMm];
  return values.every((value) => value != null) ? `${values.join(" × ")} mm` : "—";
}

function shortHash(value: string) {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

/** Immutable calculator-adapter output. The panel never derives dimensions
 * and deliberately exposes review, not production release. */
export function ComponentSnapshotsPanel({
  snapshots,
  revisionStatus,
  loading,
  error,
  canReview,
  pending,
  authorityReady,
  reviewContext,
  onReview,
}: ComponentSnapshotsPanelProps) {
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<{ snapshotId: string; message: string } | null>(null);

  async function decide(snapshot: ComponentSnapshot, state: "VERIFIED" | "REJECTED") {
    const resolution = resolutions[snapshot.id]?.trim() ?? "";
    if (!authorityReady || pending || resolution.length < 3) return;
    try {
      setReviewError(null);
      await onReview(snapshot.id, state, resolution);
      setResolutions((current) => ({ ...current, [snapshot.id]: "" }));
    } catch (error) {
      setReviewError({ snapshotId: snapshot.id, message: componentSnapshotErrorMessage(error, "review") });
    }
  }

  return <section className="order-component-panel" aria-labelledby="component-snapshot-title">
    <header className="order-component-heading">
      <div>
        <span>Verziózott kalkulációs kimenet</span>
        <h2 id="component-snapshot-title">Alkatrészek és szabászati méretek</h2>
        <p>A sorok megváltoztathatatlan snapshotból érkeznek. A felület nem számol képletet és nem pótol hiányzó méretet.</p>
      </div>
      <b>{snapshots.length} snapshot</b>
    </header>

    {loading && <p className="order-component-empty">Snapshotok betöltése…</p>}
    {error && <p className="order-component-empty is-error">A snapshotok nem érhetők el. A kapu fail-closed marad.</p>}
    {!loading && !error && snapshots.length === 0 && <p className="order-component-empty">
      {revisionStatus === "APPROVED"
        ? "A jóváhagyott revízióhoz még nincs materializált adapterkimenet."
        : "Alkatrészsnapshot csak jóváhagyott rendelési revízióhoz készülhet."}
    </p>}

    <div className="order-component-list">
      {snapshots.map((snapshot) => {
        const resolution = resolutions[snapshot.id] ?? "";
        const isCurrentReviewSource = reviewContext != null
          && snapshot.orderContentHash === reviewContext.approvedOrderContentHash
          && snapshot.snapshotSchemaVersion === reviewContext.snapshotSchemaVersion
          && reviewContext.activeProfileVersions.includes(snapshot.calculatorProfileVersion);
        const decidable = snapshot.state === "REVIEW" && canReview;
        const reviewReady = decidable && authorityReady;
        const verifiable = reviewReady && isCurrentReviewSource;
        return <article className={`order-component-snapshot state-${snapshot.state.toLowerCase()}`} key={snapshot.id}>
          <header>
            <div>
              <span>{snapshot.calculatorProfileVersion}</span>
              <h3>{snapshot.requirements.length} alkatrészsor</h3>
              <p>{snapshot.sourceWorkOrderKey} · forrásrevízió <code title={snapshot.sourceOrderRevision}>{shortHash(snapshot.sourceOrderRevision)}</code></p>
            </div>
            <b>{snapshotStateLabel[snapshot.state]}</b>
          </header>

          {snapshot.state === "REVIEW" && <div className="order-component-release-warning">
            <strong>Nem kiadható</strong>
            <span>Ez ellenőrzési állapot, nem üzemi kiadás vagy munkacsomag.</span>
          </div>}
          {snapshot.state === "REVIEW" && authorityReady && !isCurrentReviewSource && <div className="order-component-stale-warning">
            <strong>Elfogadás zárolva</strong>
            <span>A rendelési hash, a snapshot-séma vagy az aktív profilverzió nem igazolható aktuálisként. A snapshot elutasítással lezárható, elfogadni nem lehet.</span>
          </div>}
          {snapshot.state === "REVIEW" && !authorityReady && <div className="order-component-stale-warning">
            <strong>Döntés zárolva</strong>
            <span>A rendelési és konfigurációs függőségek ellenőrzése folyamatban van vagy hibázott. Elfogadás és elutasítás csak friss authority-adatokkal indítható.</span>
          </div>}

          <dl className="order-component-lineage">
            <div><dt>Rendelési hash</dt><dd><code title={snapshot.orderContentHash}>{shortHash(snapshot.orderContentHash)}</code></dd></div>
            <div><dt>Snapshot séma</dt><dd>{snapshot.snapshotSchemaVersion}</dd></div>
            <div><dt>Műszaki katalógus</dt><dd>{snapshot.technicalCatalogVersion}</dd></div>
            <div><dt>Output hash</dt><dd><code title={snapshot.outputHash}>{shortHash(snapshot.outputHash)}</code></dd></div>
          </dl>
          <div className="order-component-creation-note">
            <strong>Létrehozói review-megjegyzés</strong>
            <span>{snapshot.reviewNote}</span>
          </div>

          <div className="order-component-requirements">
            {snapshot.requirements.map((requirement) => <details key={requirement.id}>
              <summary>
                <span>{requirement.componentKey}</span>
                <strong>{requirement.name}</strong>
                <b>{requirement.quantity} {requirement.quantityUnit}</b>
              </summary>
              <dl>
                <div><dt>Forrás</dt><dd>{requirement.sourceKind} · {requirement.sourceRecordId}</dd></div>
                <div><dt>Forráskomponens-kulcs</dt><dd><code>{requirement.sourceComponentKey}</code></dd></div>
                <div><dt>Jelleg</dt><dd>{requirement.requirementKind === "CUT_PART" ? "Gyártott alkatrész" : "Vásárolt alkatrész"}</dd></div>
                <div><dt>Anyag / felület</dt><dd>{[requirement.materialKey, requirement.finishKey].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt>Készméret</dt><dd>{dimensions(requirement, "finished")}</dd></div>
                <div><dt>Szabászati méret</dt><dd>{dimensions(requirement, "cutting")}</dd></div>
                <div><dt>Szálirány</dt><dd>{requirement.grainDirection ?? "—"}</dd></div>
                <div><dt>Sor hash</dt><dd><code title={requirement.lineHash}>{shortHash(requirement.lineHash)}</code></dd></div>
              </dl>
              {requirement.notes && <p>{requirement.notes}</p>}
            </details>)}
          </div>

          {decidable && <div className="order-component-review">
            <label>
              <span>Review indoklása *</span>
              <textarea
                value={resolution}
                maxLength={2_000}
                onChange={(event) => setResolutions((current) => ({ ...current, [snapshot.id]: event.target.value }))}
                placeholder="Az explicit méretek ellenőrzésének eredménye"
              />
            </label>
            <div>
              <button className="order-button order-button-primary" disabled={!verifiable || pending || resolution.trim().length < 3} title={verifiable ? undefined : "Csak friss authority-adatok, aktuális rendelési hash, séma és profil mellett fogadható el."} onClick={() => void decide(snapshot, "VERIFIED")}>Elfogadás</button>
              <button className="order-button order-button-secondary" disabled={!reviewReady || pending || resolution.trim().length < 3} title={reviewReady ? undefined : "A döntési függőségek frissítése vagy hibája alatt az elutasítás is zárolt."} onClick={() => void decide(snapshot, "REJECTED")}>Elutasítás</button>
            </div>
            {reviewError?.snapshotId === snapshot.id && <p role="alert">{reviewError.message}</p>}
          </div>}

          {snapshot.state !== "REVIEW" && <div className="order-component-decision">
            <strong>{snapshotStateLabel[snapshot.state]}</strong>
            <span>{snapshot.reviewResolution ?? "Nincs döntési indoklás."}</span>
            <small>{snapshot.reviewedByRole ?? "—"} · {snapshot.reviewedAt ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.reviewedAt)) : "—"}</small>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
