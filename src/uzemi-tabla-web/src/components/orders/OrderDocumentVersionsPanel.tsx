import { useMemo, useState } from "react";
import type { OrderDocument, OrderDocumentInput, ProductionOrderPosition } from "@/services/production/types";

interface OrderDocumentVersionsPanelProps {
  documents: OrderDocument[];
  positions: ProductionOrderPosition[];
  canAddVersion: boolean;
  canLinkPosition: boolean;
  pending: boolean;
  onAddVersion: (input: OrderDocumentInput) => Promise<unknown>;
  onLinkPosition: (documentId: string, orderPositionId: string) => Promise<unknown>;
}

interface VersionDraft {
  documentId: string;
  displayName: string;
  relativePath: string;
  versionId: string;
  contentSha256: string;
}

const kindLabel = { SALES_ORDER: "Sales forrás", SURVEY: "Felmérési forrás", DRAWING: "Rajzi forrás", OTHER: "Egyéb forrás" } as const;

function shortHash(value: string | null) {
  if (!value) return "Nincs hash";
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function sortVersions(documents: OrderDocument[]) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const children = new Map<string, OrderDocument>();
  documents.forEach((document) => {
    if (document.supersedesDocumentId) children.set(document.supersedesDocumentId, document);
  });
  const first = documents.find((document) => !document.supersedesDocumentId || !byId.has(document.supersedesDocumentId));
  if (!first) return [...documents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ordered: OrderDocument[] = [];
  let current: OrderDocument | undefined = first;
  while (current && !ordered.some((document) => document.id === current?.id)) {
    ordered.push(current);
    current = children.get(current.id);
  }
  return ordered;
}

/** Version-chain and direct position-membership UI. A release reference is
 * read-only because no authoritative IssuedWorkPackage aggregate exists yet. */
export function OrderDocumentVersionsPanel({
  documents,
  positions,
  canAddVersion,
  canLinkPosition,
  pending,
  onAddVersion,
  onLinkPosition,
}: OrderDocumentVersionsPanelProps) {
  const contractReady = documents.every((document) =>
    typeof document.documentFamilyKey === "string"
    && document.documentFamilyKey.length > 0
    && Array.isArray(document.positionLinks)
    && Array.isArray(document.releaseReferences),
  );
  const families = useMemo(() => {
    const grouped = new Map<string, OrderDocument[]>();
    documents.forEach((document) => {
      const normalized = {
        ...document,
        documentFamilyKey: document.documentFamilyKey || document.id,
        positionLinks: Array.isArray(document.positionLinks) ? document.positionLinks : [],
        releaseReferences: Array.isArray(document.releaseReferences) ? document.releaseReferences : [],
      };
      grouped.set(normalized.documentFamilyKey, [...(grouped.get(normalized.documentFamilyKey) ?? []), normalized]);
    });
    return [...grouped.entries()].map(([familyKey, versions]) => ({ familyKey, versions: sortVersions(versions) }));
  }, [documents]);
  const [openFamily, setOpenFamily] = useState<string | null>(families[0]?.familyKey ?? null);
  const [versionDraft, setVersionDraft] = useState<VersionDraft | null>(null);
  const [positionSelections, setPositionSelections] = useState<Record<string, string>>({});
  const [linkConfirmations, setLinkConfirmations] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function startVersion(document: OrderDocument) {
    setVersionDraft({
      documentId: document.id,
      displayName: document.displayName,
      relativePath: document.relativePath,
      versionId: "",
      contentSha256: "",
    });
    setMessage(null);
  }

  async function addVersion(document: OrderDocument) {
    if (!versionDraft || versionDraft.documentId !== document.id) return;
    const displayName = versionDraft.displayName.trim();
    const relativePath = versionDraft.relativePath.trim();
    const contentSha256 = versionDraft.contentSha256.trim();
    const versionId = versionDraft.versionId.trim();
    if (!displayName || !relativePath) {
      setMessage({ tone: "error", text: "Az új változathoz név és relatív forrásútvonal szükséges." });
      return;
    }
    if (document.source === "SHAREPOINT" && (!document.driveId || !document.itemId || !versionId)) {
      setMessage({ tone: "error", text: "SharePoint-változathoz drive-, item- és új version ID szükséges." });
      return;
    }
    if (contentSha256 && !/^[a-f0-9]{64}$/i.test(contentSha256)) {
      setMessage({ tone: "error", text: "A SHA-256 érték pontosan 64 hexadecimális karakter." });
      return;
    }
    try {
      await onAddVersion({
        source: document.source,
        kind: document.kind,
        displayName,
        relativePath,
        ...(document.driveId ? { driveId: document.driveId } : {}),
        ...(document.itemId ? { itemId: document.itemId } : {}),
        ...(versionId ? { versionId } : {}),
        ...(contentSha256 ? { contentSha256 } : {}),
        supersedesDocumentId: document.id,
      });
      setVersionDraft(null);
      setMessage({ tone: "success", text: "Az új dokumentumváltozat változhatatlan rekordként rögzítve." });
    } catch {
      setMessage({ tone: "error", text: "Az új változat nem rögzíthető. Ellenőrizd, hogy a revízió és az előző dokumentum még aktuális." });
    }
  }

  async function linkPosition(document: OrderDocument) {
    const orderPositionId = positionSelections[document.id];
    if (!orderPositionId || !linkConfirmations[document.id]) return;
    try {
      await onLinkPosition(document.id, orderPositionId);
      setPositionSelections((current) => ({ ...current, [document.id]: "" }));
      setLinkConfirmations((current) => ({ ...current, [document.id]: false }));
      setMessage({ tone: "success", text: "A dokumentumváltozat a kiválasztott pozícióhoz kapcsolva." });
    } catch {
      setMessage({ tone: "error", text: "A pozíciókapcsolat nem rögzíthető. A felület nem próbál törlést vagy felülírást." });
    }
  }

  if (documents.length === 0) return <p className="order-document-empty">Még nincs rögzített dokumentumhivatkozás.</p>;

  return <div className="order-document-families">
    <p className="order-document-panel-message is-warning" role="note">
      <strong>Forrásfájl rögzítve.</strong> A hivatkozás, verzió és hash a fájlt azonosítja; a tartalma ettől még nincs mezőszinten ellenőrizve.
    </p>
    {!contractReady && <p className="order-document-panel-message is-error" role="alert">A dokumentumverziós backend-szerződés nem teljes. A meglévő hivatkozások csak olvashatók; változat és pozíciókapcsolat nem rögzíthető.</p>}
    {message && <p className={`order-document-panel-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    {families.map((family) => {
      const latest = family.versions[family.versions.length - 1];
      const expanded = openFamily === family.familyKey;
      const linkedPositionCount = new Set(family.versions.flatMap((document) => document.positionLinks.map((link) => link.orderPositionId))).size;
      const releaseCount = family.versions.reduce((sum, document) => sum + document.releaseReferences.length, 0);
      return <article className="order-document-family" key={family.familyKey}>
        <button type="button" aria-expanded={expanded} aria-controls={`document-family-${family.familyKey}`} onClick={() => setOpenFamily((current) => current === family.familyKey ? null : family.familyKey)}>
          <span>{kindLabel[latest.kind]}</span>
          <div><strong>{latest.displayName}</strong><small>{family.versions.length} változat · {linkedPositionCount} pozíció · {releaseCount} kiadási hivatkozás</small></div>
          <b>{latest.contentSha256 ? "Hash rögzítve" : "Hash hiányzik"}</b>
        </button>

        {expanded && <div className="order-document-family-detail" id={`document-family-${family.familyKey}`}>
          <ol className="order-document-version-list">
            {[...family.versions].reverse().map((document, reverseIndex) => {
              const versionNumber = family.versions.length - reverseIndex;
              const linkedIds = new Set(document.positionLinks.map((link) => link.orderPositionId));
              const availablePositions = positions.filter((position) => !linkedIds.has(position.id));
              const isLatest = document.id === latest.id;
              return <li className={isLatest ? "is-current" : ""} key={document.id}>
                <header>
                  <div><span>V{versionNumber}</span><strong>{document.displayName}</strong><small>{new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.createdAt))}</small></div>
                  <b>{isLatest ? "Aktuális változat" : "Történeti változat"}</b>
                </header>
                <dl>
                  <div><dt>Forrás</dt><dd>{document.source}</dd></div>
                  <div><dt>Verzióazonosító</dt><dd>{document.versionId ?? "Helyi forrásverzió"}</dd></div>
                  <div><dt>SHA-256</dt><dd><code title={document.contentSha256 ?? undefined}>{shortHash(document.contentSha256)}</code></dd></div>
                  <div><dt>Relatív útvonal</dt><dd><code>{document.relativePath}</code></dd></div>
                </dl>

                <div className="order-document-position-links">
                  <span>Kapcsolt pozíciók</span>
                  {document.positionLinks.length === 0 ? <p>Nincs közvetlen pozíciókapcsolat.</p> : <ul>{document.positionLinks.map((link) => {
                    const position = positions.find((candidate) => candidate.id === link.orderPositionId);
                    return <li key={link.orderPositionId}>{position ? `${position.code} · ${position.name}` : link.orderPositionId}</li>;
                  })}</ul>}
                  <small>A dokumentumkapcsolat forrástagságot jelez, nem mezőszintű ellenőrzést.</small>
                </div>

                {document.releaseReferences.length > 0 && <details className="order-document-release-references">
                  <summary>{document.releaseReferences.length} korábbi kiadási hivatkozás · csak olvasható</summary>
                  <ul>{document.releaseReferences.map((reference) => <li key={reference.id}><strong>{reference.issuedWorkPackageKey}</strong><span>{reference.releaseNote}</span><code>{shortHash(reference.documentContentSha256)}</code></li>)}</ul>
                </details>}

                {isLatest && canLinkPosition && contractReady && availablePositions.length > 0 && <div className="order-document-link-form">
                  <label><span>Pozícióhoz kapcsolás</span><select value={positionSelections[document.id] ?? ""} onChange={(event) => setPositionSelections((current) => ({ ...current, [document.id]: event.target.value }))}><option value="">Pozíció választása…</option>{availablePositions.map((position) => <option key={position.id} value={position.id}>{position.code} · {position.name}</option>)}</select></label>
                  <label className="order-document-link-confirm"><input type="checkbox" checked={linkConfirmations[document.id] ?? false} onChange={(event) => setLinkConfirmations((current) => ({ ...current, [document.id]: event.target.checked }))} /><span>Ellenőriztem a közvetlen kapcsolatot. Ezen a felületen nem távolítható el.</span></label>
                  <button className="order-button order-button-secondary" type="button" disabled={pending || !positionSelections[document.id] || !linkConfirmations[document.id]} onClick={() => void linkPosition(document)}>Kapcsolat rögzítése</button>
                </div>}
              </li>;
            })}
          </ol>

          {canAddVersion && contractReady && <div className="order-document-new-version">
            {versionDraft?.documentId !== latest.id ? <button className="order-button order-button-secondary" type="button" onClick={() => startVersion(latest)}>Új dokumentumváltozat</button> : <>
              <header><strong>Új változat</strong><span>A korábbi rekord és pozíciókapcsolatai változatlanok; az új változat kapcsolatait külön kell rögzíteni.</span></header>
              <div>
                <label><span>Dokumentumnév</span><input value={versionDraft.displayName} onChange={(event) => setVersionDraft({ ...versionDraft, displayName: event.target.value })} /></label>
                <label><span>Relatív útvonal</span><input value={versionDraft.relativePath} onChange={(event) => setVersionDraft({ ...versionDraft, relativePath: event.target.value })} /></label>
                {latest.source === "SHAREPOINT" && <label><span>Új SharePoint version ID</span><input value={versionDraft.versionId} onChange={(event) => setVersionDraft({ ...versionDraft, versionId: event.target.value })} /></label>}
                <label><span>SHA-256, ha ellenőrzött</span><input value={versionDraft.contentSha256} onChange={(event) => setVersionDraft({ ...versionDraft, contentSha256: event.target.value })} /></label>
              </div>
              <footer><button className="order-button order-button-secondary" type="button" onClick={() => setVersionDraft(null)}>Mégse</button><button className="order-button order-button-primary" type="button" disabled={pending} onClick={() => void addVersion(latest)}>Változat rögzítése</button></footer>
            </>}
          </div>}
        </div>}
      </article>;
    })}
  </div>;
}
