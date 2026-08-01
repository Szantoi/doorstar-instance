import type { Role } from "@/store/uiStore";
import type { OrderIntakeStage, ProductionOrderCard, ProjectCard } from "@/services/production/types";

/**
 * The project register deliberately derives its state from existing order and
 * board records. It does not invent a parallel project workflow on the client.
 */
export type ProjectWorkspaceState = "ATTENTION" | "PLANNING" | "IN_PRODUCTION" | "READY" | "UNSTRUCTURED";

export interface ProjectWorkspaceRow extends ProjectCard {
  order: ProductionOrderCard | null;
  state: ProjectWorkspaceState;
  stateLabel: string;
  stateHint: string;
  primaryHref: string;
  primaryLabel: string;
}

type OrderWorkspaceDestination = "order" | "survey" | "technical";

const attentionByStage: Partial<Record<OrderIntakeStage, { label: string; hint: string; href: OrderWorkspaceDestination }>> = {
  SALES_DRAFT: { label: "Sales-adatok hiányosak", hint: "A rendelési alapadatok még piszkozatban vannak.", href: "order" },
  SALES_DOCUMENTS_RECEIVED: { label: "Felmérésre vár", hint: "A dokumentumok megérkeztek, a végleges műszaki felmérés hiányzik.", href: "survey" },
  SURVEY_PENDING: { label: "Felmérésre vár", hint: "A gyártható műszaki adatok felmérésre várnak.", href: "survey" },
  SURVEY_EXCEPTION_REVIEW: { label: "Felmérési kivétel", hint: "A felmérés eltérése emberi döntést igényel.", href: "survey" },
  SURVEY_COMPLETED: { label: "Műszaki előkészítés", hint: "A felmérés kész; a rendelési revíziót elő kell készíteni.", href: "order" },
  TECHNICAL_PREPARATION: { label: "Műszaki előkészítés", hint: "A rendelés gyártási előkészítés alatt áll.", href: "technical" },
};

function pathForOrder(order: ProductionOrderCard, destination: OrderWorkspaceDestination) {
  const key = encodeURIComponent(order.projectKey);
  if (destination === "survey") return `/orders/${key}/survey`;
  if (destination === "technical") return `/orders/${key}/technical-preparation`;
  return `/orders/${key}`;
}

/** Combines the two existing registers by stable Project key. */
export function buildProjectWorkspaceRows(projects: ProjectCard[], orders: ProductionOrderCard[]): ProjectWorkspaceRow[] {
  const ordersByProject = new Map(orders.map((order) => [order.projectKey, order]));

  return projects.map((project) => {
    const order = ordersByProject.get(project.key) ?? null;
    const isComplete = project.status === "SHIPPING_READY" || (project.totalTasks > 0 && project.doneTasks === project.totalTasks);

    if (isComplete) {
      return { ...project, order, state: "READY", stateLabel: "Kiszállításra kész", stateHint: "A projekt összes kiadott gyártási lépése elkészült.", primaryHref: `/projects/${encodeURIComponent(project.key)}`, primaryLabel: "Projekt megnyitása" };
    }

    if (order?.status === "REVIEW") {
      return { ...project, order, state: "ATTENTION", stateLabel: "Jóváhagyásra vár", stateHint: "A rendelési revízió ellenőrzés alatt áll; kiadás előtt jóváhagyás szükséges.", primaryHref: pathForOrder(order, "order"), primaryLabel: "Rendelés ellenőrzése" };
    }

    if (order?.status === "DRAFT") {
      const attention = attentionByStage[order.intakeStage] ?? attentionByStage.SALES_DRAFT!;
      const primaryLabel = attention.href === "survey"
        ? "Felmérés megnyitása"
        : attention.href === "technical"
          ? "Műszaki előkészítés"
          : "Rendelés folytatása";
      return { ...project, order, state: "ATTENTION", stateLabel: attention.label, stateHint: attention.hint, primaryHref: pathForOrder(order, attention.href), primaryLabel };
    }

    if (project.totalTasks === 0) {
      return {
        ...project,
        order,
        state: order ? "PLANNING" : "UNSTRUCTURED",
        stateLabel: order ? "Tervezésre vár" : "Munkamenet hiányzik",
        stateHint: order ? "A jóváhagyott rendelés a verziózott alkatrész- és művelettervre vár." : "A projekthez még nincs epik vagy gyártási lépés rögzítve.",
        primaryHref: order ? `/projects/${encodeURIComponent(project.key)}` : `/projects/${encodeURIComponent(project.key)}/work-session`,
        primaryLabel: order ? "Folyamat megnyitása" : "Segédmunkalap összeállítása",
      };
    }

    return { ...project, order, state: "IN_PRODUCTION", stateLabel: "Gyártás alatt", stateHint: `${project.totalTasks - project.doneTasks} nyitott gyártási lépés van a munkamenetben.`, primaryHref: `/projects/${encodeURIComponent(project.key)}/work-session`, primaryLabel: "Munkamenet megnyitása" };
  });
}

export function filterProjectWorkspaceRows(rows: ProjectWorkspaceRow[], query: string, state: ProjectWorkspaceState | "ALL") {
  const normalizedQuery = query.trim().toLocaleLowerCase("hu-HU");
  return rows.filter((row) => {
    const matchesState = state === "ALL" || row.state === state;
    const searchable = [row.name, row.num, row.key, row.order?.customerName, row.order?.projectNum].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU");
    return matchesState && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

/** Temporary client guard matching the documented production-planning role. */
export function canManageProjectWorkspace(role: Role) {
  return ["production_planner", "administrator", "vezeto"].includes(role);
}
