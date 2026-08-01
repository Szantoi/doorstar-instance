import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { useCreateProject, useEpikRollup, useProductionOrders, useProjects } from "@/services/production/hooks";
import {
  buildProjectWorkspaceRows,
  canManageProjectWorkspace,
  filterProjectWorkspaceRows,
  type ProjectWorkspaceRow,
  type ProjectWorkspaceState,
} from "@/lib/projectWorkspace";

const shortDayNames = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const stateFilters: Array<{ value: ProjectWorkspaceState | "ALL"; label: string }> = [
  { value: "ALL", label: "Minden" }, { value: "ATTENTION", label: "Figyelmet kér" },
  { value: "PLANNING", label: "Tervezésre vár" }, { value: "IN_PRODUCTION", label: "Gyártás alatt" },
  { value: "READY", label: "Kiszállítható" },
];

function ProjectEpikSummary({ projectKey }: { projectKey: string }) {
  const { data } = useEpikRollup(projectKey);
  const rows = data?.epikRows ?? [];
  if (!rows.length) return null;

  return <ul className="project-epic-list" aria-label="Epikek állapota">
    {rows.slice(0, 3).map((row) => <li key={row.name}>
      <span>{row.name}</span><b>{row.done}/{row.total}</b>
      <small>{row.next ? `Következő: ${row.next.title} · ${shortDayNames[row.next.day] ?? ""}` : "Minden lépés kész"}</small>
    </li>)}
    {rows.length > 3 && <li className="project-epic-more">+ {rows.length - 3} további epik a munkalapon</li>}
  </ul>;
}

function ProjectCreateForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [error, setError] = useState("");

  function createKey() {
    const source = num.trim() || name.trim();
    return source.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Adj meg projektnevet."); return; }
    const key = createKey();
    if (!key) { setError("A projektazonosító nem képezhető; adj meg munkaszámot."); return; }
    setError("");
    createProject.mutate({ key, name: name.trim(), num: num.trim() || undefined }, {
      onSuccess: () => navigate(`/projects/${encodeURIComponent(key)}/work-session`),
      onError: () => setError("A projekt létrehozása nem sikerült. Ellenőrizd, hogy nincs-e már ilyen munkaszám vagy projektazonosító."),
    });
  }

  return <form className="project-create-form" onSubmit={submit}>
    <div><label htmlFor="project-name">Projekt neve</label><input id="project-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Például: Koroknai Richárd" /></div>
    <div><label htmlFor="project-number">Munkaszám</label><input id="project-number" value={num} onChange={(event) => setNum(event.target.value)} placeholder="Például: 26148" /></div>
    <p>Az üres projekt csak munkamenet-előkészítéshez való. Új ügyfélmegrendelést a Sales felületen rögzíts.</p>
    {error && <div className="project-form-error" role="alert">{error}</div>}
    <div className="project-create-actions"><button className="project-button project-button-secondary" type="button" onClick={onClose}>Mégse</button><button className="project-button project-button-primary" disabled={createProject.isPending} type="submit">{createProject.isPending ? "Létrehozás…" : "Üres projekt létrehozása"}</button></div>
  </form>;
}

function ProjectCard({ row }: { row: ProjectWorkspaceRow }) {
  const progress = Math.max(0, Math.min(100, row.progressPct));
  return <article className="project-workspace-card">
    <header className="project-card-header">
      <div><span className="project-card-number">{row.num ?? row.key}</span><h2>{row.name}</h2></div>
      <span className={`project-state project-state-${row.state.toLowerCase()}`}>{row.stateLabel}</span>
    </header>
    <div className="project-card-body">
      <p className="project-state-hint">{row.stateHint}</p>
      <div className="project-progress" aria-label={`${progress}% kész`}><span style={{ width: `${progress}%` }} /></div>
      <div className="project-progress-data"><span>{row.totalTasks ? `${row.doneTasks} / ${row.totalTasks} lépés kész` : "Még nincs gyártási lépés"}</span><b>{row.totalTasks ? `${progress}%` : "—"}</b></div>
      {row.order && <div className="project-order-reference"><span>Rendelés</span><Link to={`/orders/${encodeURIComponent(row.key)}`}>R{String(row.order.revision).padStart(2, "0")} · {row.order.customerName} · {row.order.positionCount} pozíció</Link></div>}
      <ProjectEpikSummary projectKey={row.key} />
    </div>
    <footer className="project-card-footer"><Link className="project-card-action" to={row.primaryHref}>{row.primaryLabel} <span>→</span></Link><Link className="project-card-detail" to={`/projects/${encodeURIComponent(row.key)}`}>Részletek</Link></footer>
  </article>;
}

export function ProjectsPage() {
  const { role } = useUiStore();
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useProjects();
  const { data: orders = [], isLoading: ordersLoading, isError: ordersError } = useProductionOrders();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectWorkspaceState | "ALL">("ALL");
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => buildProjectWorkspaceRows(projects, orders), [projects, orders]);
  const visibleRows = useMemo(() => filterProjectWorkspaceRows(rows, query, filter), [rows, query, filter]);
  const attentionCount = rows.filter((row) => row.state === "ATTENTION").length;
  const planningCount = rows.filter((row) => row.state === "PLANNING" || row.state === "UNSTRUCTURED").length;
  const canManage = canManageProjectWorkspace(role);
  const registryLoading = projectsLoading || ordersLoading;
  const registryError = projectsError || ordersError;

  return <main className="projects-page"><div className="projects-content">
    <header className="projects-hero">
      <div><p>Projektek</p><h1>Projektmunkatér</h1><span>A következő szükséges lépés szerint rendezett, rendeléshez és munkamenethez kapcsolt projektlista.</span></div>
      <div className="projects-hero-actions"><Link className="project-button project-button-secondary" to="/orders/new">Új sales rendelés</Link>{canManage && <button className="project-button project-button-primary" type="button" onClick={() => setAdding((value) => !value)}>{adding ? "Bezárás" : "Üres projekt"}</button>}</div>
    </header>

    {adding && <ProjectCreateForm onClose={() => setAdding(false)} />}

    {!registryLoading && !registryError && <section className="project-work-queue" aria-label="Projekt összefoglaló">
      <div><strong>{rows.length}</strong><span>aktív projekt</span></div><div><strong>{attentionCount}</strong><span>figyelmet kér</span></div><div><strong>{planningCount}</strong><span>tervezésre vár</span></div>
    </section>}

    <section className="project-register" aria-labelledby="project-register-title">
      <div className="project-register-head"><div><p>Projektregiszter</p><h2 id="project-register-title">Aktív munkák</h2></div><label className="project-search"><span>Keresés</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Munkaszám, projekt vagy megrendelő" /></label></div>
      <div className="project-filter-row" aria-label="Projektállapot szűrő">{stateFilters.map((entry) => <button type="button" className={filter === entry.value ? "is-active" : ""} key={entry.value} onClick={() => setFilter(entry.value)}>{entry.label}</button>)}</div>
      {registryLoading && <div className="projects-state">Projekt- és rendelési kapcsolatok betöltése…</div>}
      {registryError && <div className="projects-state">A rendelési kapcsolatok nem ellenőrizhetők. A rendszer nem sorolja a projekteket tévesen rendelés nélküli munkamenethez.</div>}
      {!registryLoading && !registryError && visibleRows.length === 0 && <div className="projects-state">Nincs a keresésnek vagy a kiválasztott állapotnak megfelelő aktív projekt.</div>}
      {!registryLoading && !registryError && visibleRows.length > 0 && <div className="project-workspace-grid">{visibleRows.map((row) => <ProjectCard key={row.key} row={row} />)}</div>}
    </section>
  </div></main>;
}
