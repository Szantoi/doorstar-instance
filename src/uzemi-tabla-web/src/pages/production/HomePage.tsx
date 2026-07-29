import { Link } from "react-router-dom";
import { useProjects } from "@/services/production/hooks";

const WORKSPACES = [
  { to: "/orders", number: "01", title: "Rendelések", description: "Új gyártási megrendelés felvétele, piszkozatok és revíziók kezelése.", action: "Rendelések megnyitása" },
  { to: "/projects", number: "02", title: "Projektek", description: "Projektadatok, munkalapok, kiadás és a gyártási előkészítés áttekintése.", action: "Projektek megnyitása" },
  { to: "/imports", number: "03", title: "Import Inbox", description: "Excel- és dokumentumforrások előnézetei, betöltési állapotai és adatminőségi nyoma.", action: "Importok megnyitása" },
  { to: "/board", number: "04", title: "Üzemi Whiteboard", description: "Az aktuális gyártási hét operátori táblája, Kanban és kapacitásnézet.", action: "Üzemi tábla megnyitása" },
];

export function HomePage() {
  const { data: projects = [], isLoading, isError } = useProjects();
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
          {isLoading ? <p className="doorstar-overview-state">Adatok betöltése…</p> : isError ? <p className="doorstar-overview-state">Az áttekintéshez a termelési szolgáltatás elérése szükséges.</p> : (
            <div className="doorstar-metric-grid">
              <div><strong>{activeProjects}</strong><span>aktív projekt</span></div>
              <div><strong>{totalTasks - doneTasks}</strong><span>nyitott gyártási lépés</span></div>
              <div><strong>{projects.length ? `${Math.round((doneTasks / Math.max(totalTasks, 1)) * 100)}%` : "—"}</strong><span>összesített készültség</span></div>
            </div>
          )}
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
