import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProjectChainPanel, type ProjectChainLoadState } from "@/components/projects/ProjectChainPanel";
import { canManageProjectWorkspace } from "@/lib/projectWorkspace";
import {
  useDeleteProject,
  useOrderRevisionReadiness,
  useProductionOrder,
  useProject,
  useProjectWorkflow,
  useUpdateProject,
} from "@/services/production/hooks";
import { ApiError } from "@/services/apiClient";
import { useConfirmStore } from "@/store/confirmStore";
import { useUiStore } from "@/store/uiStore";

type ProjectMetaField = "name" | "num" | "kezdes" | "beepites" | "szinTok" | "szinLap";

/** Office-facing project cockpit. The legacy epic/task editor is deliberately
 * kept on a separate route so board-era controls cannot mix with this surface. */
export function ProjectDetailPage() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const role = useUiStore((state) => state.role);
  const canManage = canManageProjectWorkspace(role);
  const projectQuery = useProject(key);
  const productionOrderQuery = useProductionOrder(key);
  const project = projectQuery.data;
  const productionOrder = productionOrderQuery.data;
  const updateProject = useUpdateProject(key);
  const deleteProject = useDeleteProject(key);
  const latestRevision = productionOrder?.revisions.reduce(
    (latest, revision) => revision.revision > latest.revision ? revision : latest,
    productionOrder.revisions[0]!,
  ) ?? null;
  const readinessQuery = useOrderRevisionReadiness(key, latestRevision?.revision);
  const workflowQuery = useProjectWorkflow(key, !!latestRevision);
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [kezdes, setKezdes] = useState("");
  const [beepites, setBeepites] = useState("");
  const [szinTok, setSzinTok] = useState("");
  const [szinLap, setSzinLap] = useState("");
  const dirtyMetaFieldsRef = useRef(new Set<ProjectMetaField>());
  const loadedProjectKeyRef = useRef<string | null>(null);
  const projectMutationBlocked = !canManage
    || projectQuery.isFetching
    || projectQuery.isError
    || updateProject.isPending
    || deleteProject.isPending;
  const projectMutationBlockedRef = useRef(projectMutationBlocked);
  projectMutationBlockedRef.current = projectMutationBlocked;

  function syncProjectMeta(nextProject: typeof project, preserveDirty: boolean) {
    if (!nextProject) return;
    const dirtyFields = dirtyMetaFieldsRef.current;
    if (!preserveDirty || !dirtyFields.has("name")) setName(nextProject.name);
    if (!preserveDirty || !dirtyFields.has("num")) setNum(nextProject.num ?? "");
    if (!preserveDirty || !dirtyFields.has("kezdes")) setKezdes(nextProject.kezdes ?? "");
    if (!preserveDirty || !dirtyFields.has("beepites")) setBeepites(nextProject.beepites ?? "");
    if (!preserveDirty || !dirtyFields.has("szinTok")) setSzinTok(nextProject.szinTok ?? "");
    if (!preserveDirty || !dirtyFields.has("szinLap")) setSzinLap(nextProject.szinLap ?? "");
  }

  useEffect(() => {
    if (!project || project.key !== key) return;
    const projectChanged = loadedProjectKeyRef.current !== key;
    if (projectChanged) {
      loadedProjectKeyRef.current = key;
      dirtyMetaFieldsRef.current.clear();
    }
    syncProjectMeta(project, !projectChanged);
  }, [key, project]);

  if (projectQuery.isLoading) {
    return <main className="project-detail-page"><div className="project-detail-content"><div className="orders-state">Projekt betöltése…</div></div></main>;
  }
  if (!project) {
    return <main className="project-detail-page"><div className="project-detail-content"><div className="orders-state">A projekt nem érhető el.</div></div></main>;
  }
  if (productionOrderQuery.isLoading) {
    return <main className="project-detail-page"><div className="project-detail-content"><div className="orders-state">Rendelési kapcsolat ellenőrzése…</div></div></main>;
  }
  const orderIsMissing = productionOrderQuery.error instanceof ApiError && productionOrderQuery.error.status === 404;
  if (productionOrderQuery.isError && !orderIsMissing) {
    return <main className="project-detail-page"><div className="project-detail-content"><div className="orders-state">A rendelési kapcsolat nem ellenőrizhető. A segédmunkalap nem nyílik meg automatikusan.</div></div></main>;
  }

  async function archiveProject() {
    if (!project || projectMutationBlockedRef.current) return;
    const accepted = await useConfirmStore.getState().ask(
      `Archiválod a(z) „${project.name}” projektet? A rendelési előzmények és a korábbi üzemi feladatok megmaradnak.`,
    );
    if (!accepted || projectMutationBlockedRef.current) return;
    deleteProject.mutate(undefined, { onSuccess: () => navigate("/projects") });
  }

  const saveText = (field: ProjectMetaField, value: string, previous: string | null) => {
    if (projectMutationBlockedRef.current) return;
    const normalized = value.trim();
    if ((normalized || null) === previous || (field === "name" && !normalized)) {
      dirtyMetaFieldsRef.current.delete(field);
      syncProjectMeta(project, true);
      return;
    }
    updateProject.mutate(
      { [field]: field === "name" ? normalized : normalized || null },
      {
        onSuccess: (savedProject) => {
          if (loadedProjectKeyRef.current !== savedProject.key) return;
          dirtyMetaFieldsRef.current.delete(field);
          syncProjectMeta(savedProject, true);
        },
      },
    );
  };

  const mutationStatus = projectQuery.isFetching
    ? "Projektadatok háttérellenőrzése… A szerkesztés átmenetileg szünetel."
    : updateProject.isPending
      ? "Projektadatok mentése…"
      : deleteProject.isPending
        ? "Projekt archiválása…"
        : null;
  const mutationError = projectQuery.isError
    ? "A projektadatok háttérellenőrzése sikertelen. A szerkesztés szünetel."
    : updateProject.isError
      ? "A projektadatok mentése sikertelen. Próbáld újra."
      : deleteProject.isError
        ? "A projekt archiválása sikertelen. Próbáld újra."
        : null;
  const projectChainState: ProjectChainLoadState = !latestRevision
    ? "UNAVAILABLE"
    : productionOrderQuery.isFetching
      || readinessQuery.isLoading
      || readinessQuery.isFetching
      || workflowQuery.isLoading
      || workflowQuery.isFetching
      ? "PENDING"
      : readinessQuery.isError || workflowQuery.isError
        ? "ERROR"
        : "READY";

  return (
    <main className="project-detail-page project-office-page">
      <div className="project-detail-content">
        <div className="order-intake-breadcrumb"><Link to="/projects">Projektek</Link> / {project.key}</div>
        <header className="project-office-hero">
          <div>
            <span>Projektfolyamat · {project.key}</span>
            {canManage ? (
              <>
                <h1 className="project-heading-visually-hidden">{project.name}</h1>
                <input
                  aria-label="Projekt neve"
                  value={name}
                  disabled={projectMutationBlocked}
                  onChange={(event) => {
                    dirtyMetaFieldsRef.current.add("name");
                    setName(event.target.value);
                  }}
                  onBlur={() => saveText("name", name, project.name)}
                />
              </>
            ) : <h1>{project.name}</h1>}
            <p>A projekt üzleti kapui, következő feladata és ellenőrzött forrásai. Üzemi feladat innen közvetlenül nem adható ki.</p>
          </div>
          <div className="project-office-hero-actions">
            {latestRevision && <Link to={`/orders/${encodeURIComponent(key)}`}>Rendelési adatlap</Link>}
            {canManage && (
              <button disabled={projectMutationBlocked} onClick={() => void archiveProject()}>
                {deleteProject.isPending ? "Archiválás…" : "Projekt archiválása"}
              </button>
            )}
          </div>
        </header>

        {mutationStatus && <p role="status">{mutationStatus}</p>}
        {mutationError && <p role="alert">{mutationError}</p>}

        <section className="project-office-meta" aria-label="Projekt törzsadatok">
          <label><span>Munkaszám</span><input value={num} disabled={projectMutationBlocked} onChange={(event) => { dirtyMetaFieldsRef.current.add("num"); setNum(event.target.value); }} onBlur={() => saveText("num", num, project.num)} /></label>
          <label><span>Tervezett kezdés</span><input value={kezdes} disabled={projectMutationBlocked} onChange={(event) => { dirtyMetaFieldsRef.current.add("kezdes"); setKezdes(event.target.value); }} onBlur={() => saveText("kezdes", kezdes, project.kezdes)} /></label>
          <label><span>Beépítés</span><input value={beepites} disabled={projectMutationBlocked} onChange={(event) => { dirtyMetaFieldsRef.current.add("beepites"); setBeepites(event.target.value); }} onBlur={() => saveText("beepites", beepites, project.beepites)} /></label>
          <label><span>Tok oldali szín</span><input value={szinTok} disabled={projectMutationBlocked} onChange={(event) => { dirtyMetaFieldsRef.current.add("szinTok"); setSzinTok(event.target.value); }} onBlur={() => saveText("szinTok", szinTok, project.szinTok)} /></label>
          <label><span>Lap oldali szín</span><input value={szinLap} disabled={projectMutationBlocked} onChange={(event) => { dirtyMetaFieldsRef.current.add("szinLap"); setSzinLap(event.target.value); }} onBlur={() => saveText("szinLap", szinLap, project.szinLap)} /></label>
          <div><span>Rendelési revízió</span><strong>{latestRevision ? `R${String(latestRevision.revision).padStart(2, "0")} · ${latestRevision.status}` : "Nincs kapcsolat"}</strong></div>
        </section>

        <ProjectChainPanel
          projectKey={key}
          revisionId={latestRevision?.id ?? null}
          revisionNumber={latestRevision?.revision ?? null}
          readiness={readinessQuery.data}
          workflow={workflowQuery.data}
          state={projectChainState}
        />

        <section className="project-office-workspaces" aria-label="Projekt munkaterek">
          <article className="project-office-legacy">
            <span>Elkülönített segédfelület</span>
            <h2>Örökölt munkalap és mennyiségi lapok</h2>
            <p>A kézi epik/task szerkesztő továbbra is elérhető, de nem része az autoritatív rendelés–kalkuláció–terv–kiadás láncnak.</p>
            <Link to={`/projects/${encodeURIComponent(key)}/work-session`}>Segédlap megnyitása →</Link>
          </article>
        </section>
      </div>
    </main>
  );
}
