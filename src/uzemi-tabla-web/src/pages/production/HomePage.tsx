import { useMemo } from "react";
import { Link } from "react-router-dom";
import { buildProjectWorkspaceRows, canManageProjectWorkspace, type ProjectWorkspaceState } from "@/lib/projectWorkspace";
import { useProjects, useProductionOrders } from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";

const WORKSPACES = [
  { to: "/orders", number: "01", title: "Rendelések", description: "Új gyártási megrendelés felvétele, piszkozatok és revíziók kezelése.", action: "Rendelések megnyitása" },
  { to: "/projects", number: "02", title: "Projektek", description: "Projektadatok, munkalapok, kiadás és a gyártási előkészítés áttekintése.", action: "Projektek megnyitása" },
  { to: "/imports", number: "03", title: "Import Inbox", description: "Excel- és dokumentumforrások előnézetei, betöltési állapotai és adatminőségi nyoma.", action: "Importok megnyitása" },
  { to: "/board", number: "04", title: "Üzemi Whiteboard", description: "Az aktuális gyártási hét operátori táblája, Kanban és kapacitásnézet.", action: "Üzemi tábla megnyitása" },
];

const NEXT_ACTION_PRIORITY: Record<ProjectWorkspaceState, number> = {
  ATTENTION: 0,
  PLANNING: 1,
  UNSTRUCTURED: 2,
  IN_PRODUCTION: 3,
  READY: 4,
};

const HOME_ACTION_LIMIT = 4;

export function HomePage() {
  const { role } = useUiStore();
  const projectsQuery = useProjects();
  const ordersQuery = useProductionOrders();
  const projects = projectsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const projectsPending = projectsQuery.isLoading || projectsQuery.isFetching;
  const registryPending = projectsPending || ordersQuery.isLoading || ordersQuery.isFetching;
  const registryError = projectsQuery.isError || ordersQuery.isError;
  const canManageWorkSession = canManageProjectWorkspace(role);
  const projectRows = useMemo(() => {
    if (registryPending || registryError) return [];
    return buildProjectWorkspaceRows(projects, orders)
      .sort((left, right) => NEXT_ACTION_PRIORITY[left.state] - NEXT_ACTION_PRIORITY[right.state]);
  }, [orders, projects, registryError, registryPending]);
  const nextActions = projectRows.slice(0, HOME_ACTION_LIMIT);
  const totalTasks = projects.reduce((sum, project) => sum + project.totalTasks, 0);
  const doneTasks = projects.reduce((sum, project) => sum + project.doneTasks, 0);
  const activeProjects = projects.filter((project) => project.status !== "SHIPPING_READY").length;

  return (
    <main className="doorstar-home-page">
      <div className="doorstar-home-content">
        <section className="doorstar-home-hero">
          <div>
            <p className="doorstar-home-eyebrow">Doorstar munkaközpont</p>
            <h1>Rendezett adat,<br />átlátható gyártás.</h1>
            <p>Az irodai adatkezelés és az üzemi munka két külön felület. Itt indul a rendelés, a projekt és a jóváhagyási folyamat.</p>
          </div>
          <Link className="doorstar-home-primary-action" to="/orders/new">Új rendelés felvétele</Link>
        </section>

        <section className="doorstar-overview" aria-labelledby="overview-title">
          <div className="doorstar-section-title"><span>Áttekintés</span><h2 id="overview-title">Aktív munka</h2></div>
          {projectsPending ? <p className="doorstar-overview-state" role="status">Adatok betöltése…</p> : projectsQuery.isError ? <p className="doorstar-overview-state" role="alert">Az áttekintéshez a termelési szolgáltatás elérése szükséges.</p> : (
            <div className="doorstar-metric-grid">
              <div><strong>{activeProjects}</strong><span>aktív projekt</span></div>
              <div><strong>{totalTasks - doneTasks}</strong><span>nyitott gyártási lépés</span></div>
              <div><strong>{projects.length ? `${Math.round((doneTasks / Math.max(totalTasks, 1)) * 100)}%` : "—"}</strong><span>összesített készültség</span></div>
            </div>
          )}
        </section>

        <section className="doorstar-next-actions" aria-labelledby="next-actions-title">
          <div className="doorstar-section-title doorstar-next-actions-title">
            <span>Figyelmi munkasor</span>
            <h2 id="next-actions-title">Következő teendők</h2>
            <Link to="/projects">Teljes projektmunkatér <i aria-hidden="true">→</i></Link>
          </div>
          {registryPending && <p className="doorstar-next-actions-state" role="status">Projekt- és rendelési kapcsolatok betöltése…</p>}
          {!registryPending && registryError && <p className="doorstar-next-actions-state is-error" role="alert">A következő teendők most nem ellenőrizhetők. A rendszer nem ajánl fel munkatér-akciót hiányos rendelési kapcsolat alapján.</p>}
          {!registryPending && !registryError && nextActions.length === 0 && <p className="doorstar-next-actions-state">Nincs megjeleníthető aktív projekt. Új ügyfélmunka a sales rendelésfelvétellel indítható.</p>}
          {!registryPending && !registryError && nextActions.length > 0 && <ol className="doorstar-next-action-list">
            {nextActions.map((row) => {
              const actionLabel = row.state === "UNSTRUCTURED" && !canManageWorkSession
                ? "Segédmunkalap megtekintése"
                : row.primaryLabel;
              const workSummary = row.totalTasks
                ? `${row.doneTasks} / ${row.totalTasks} gyártási lépés kész`
                : row.order
                  ? `R${String(row.order.revision).padStart(2, "0")} · ${row.order.positionCount} pozíció`
                  : "Nincs kapcsolt rendelés";

              return <li key={row.key}>
                <article className="doorstar-next-action-card" data-state={row.state}>
                  <header>
                    <span>{row.num ?? row.key}</span>
                    <b>{row.stateLabel}</b>
                  </header>
                  <h3>{row.name}</h3>
                  {row.order && <p className="doorstar-next-action-customer">{row.order.customerName}</p>}
                  <p className="doorstar-next-action-hint"><strong>Mi hiányzik?</strong> {row.stateHint}</p>
                  <footer>
                    <small>{workSummary}</small>
                    <Link to={row.primaryHref}>{actionLabel} <i aria-hidden="true">→</i></Link>
                  </footer>
                </article>
              </li>;
            })}
          </ol>}
          {!registryPending && !registryError && projectRows.length > HOME_ACTION_LIMIT && <p className="doorstar-next-actions-more">+ {projectRows.length - HOME_ACTION_LIMIT} további projekt a teljes projektmunkatérben</p>}
        </section>

        <section className="doorstar-workspace-section" aria-labelledby="workspace-title">
          <div className="doorstar-section-title"><span>Munkaterek</span><h2 id="workspace-title">Hová szeretnél menni?</h2></div>
          <div className="doorstar-workspace-grid">
            {WORKSPACES.map((workspace) => (
              <Link className="doorstar-workspace-card" to={workspace.to} key={workspace.to}>
                <span>{workspace.number}</span><h3>{workspace.title}</h3><p>{workspace.description}</p><b>{workspace.action} <i>→</i></b>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
