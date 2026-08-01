import { Link } from "react-router-dom";
import { componentWorkspacePath } from "@/lib/componentWorkspaceRoute";
import { operationWorkspacePath } from "@/lib/operationWorkspaceRoute";

export type OfficeProjectWorkspace =
  | "PROJECT"
  | "ORDER"
  | "SURVEY"
  | "TECHNICAL_PREPARATION"
  | "COMPONENTS"
  | "OPERATIONS";

interface OfficeProjectNavigatorProps {
  projectKey: string;
  current: OfficeProjectWorkspace;
  revisionNumber?: number | null;
  historicalRevision?: boolean;
}

interface WorkspaceItem {
  key: OfficeProjectWorkspace;
  label: string;
  href: string | null;
  unavailableReason?: string;
}

function workspaceItems(projectKey: string, revisionNumber: number | null, historicalRevision: boolean): WorkspaceItem[] {
  const encodedProjectKey = encodeURIComponent(projectKey);
  return [
    { key: "PROJECT", label: "Projektállapot", href: `/projects/${encodedProjectKey}` },
    { key: "ORDER", label: "Rendelési adatlap", href: `/orders/${encodedProjectKey}` },
    { key: "SURVEY", label: "Felmérés", href: historicalRevision ? null : `/orders/${encodedProjectKey}/survey`, unavailableReason: historicalRevision ? "Csak a legfrissebb revízión" : undefined },
    { key: "TECHNICAL_PREPARATION", label: "Műszaki előkészítés", href: historicalRevision ? null : `/orders/${encodedProjectKey}/technical-preparation`, unavailableReason: historicalRevision ? "Csak a legfrissebb revízión" : undefined },
    { key: "COMPONENTS", label: "Alkatrészképzés", href: revisionNumber == null ? null : componentWorkspacePath(projectKey, revisionNumber), unavailableReason: revisionNumber == null ? "Exact revízió szükséges" : undefined },
    { key: "OPERATIONS", label: "Műveletterv", href: revisionNumber == null ? null : operationWorkspacePath(projectKey, revisionNumber), unavailableReason: revisionNumber == null ? "Exact revízió szükséges" : undefined },
  ];
}

/** Consistent office-only wayfinding. This component exposes existing routes,
 * but deliberately does not infer readiness or offer workflow mutations. */
export function OfficeProjectNavigator({ projectKey, current, revisionNumber = null, historicalRevision = false }: OfficeProjectNavigatorProps) {
  const items = workspaceItems(projectKey, revisionNumber, historicalRevision);
  const revisionLabel = revisionNumber == null ? "Nincs exact revízió" : `R${String(revisionNumber).padStart(2, "0")}`;

  return (
    <section className="office-project-navigator" aria-labelledby="office-project-navigator-title">
      <header>
        <div>
          <span>Projektmunkatér</span>
          <h2 id="office-project-navigator-title">{projectKey} · {revisionLabel}</h2>
        </div>
        {current !== "PROJECT" && (
          <Link to={`/projects/${encodeURIComponent(projectKey)}`}>Státusz és következő teendő →</Link>
        )}
      </header>

      <nav aria-label="Projekt munkaterei">
        <ol>
          {items.map((item, index) => {
            const content = (
              <>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.label}</strong>
                <small>{item.key === current ? "Most itt dolgozol" : item.href ? "Munkatér megnyitása" : item.unavailableReason}</small>
              </>
            );

            return (
              <li key={item.key} className={item.key === current ? "is-current" : item.href ? undefined : "is-unavailable"}>
                {item.key === current ? (
                  <span aria-current="page">{content}</span>
                ) : item.href ? (
                  <Link to={item.href}>{content}</Link>
                ) : (
                  <span aria-disabled="true">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <p>
        Ez munkatér-navigáció, nem készültségjelző. A szerver által ellenőrzött állapotot,
        hiányokat és következő teendőt a Projektállapot mutatja.
      </p>
    </section>
  );
}
