import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./pages/production/AppShell";
import { ProductShell } from "./pages/production/ProductShell";
import { componentWorkspaceRoutePattern } from "./lib/componentWorkspaceRoute";
import { operationWorkspaceRoutePattern } from "./lib/operationWorkspaceRoute";

const HomePage = lazy(() => import("./pages/production/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const OrdersPage = lazy(() => import("./pages/production/OrdersPage").then(({ OrdersPage }) => ({ default: OrdersPage })));
const OrderDetailPage = lazy(() => import("./pages/production/OrderDetailPage").then(({ OrderDetailPage }) => ({ default: OrderDetailPage })));
const BoardPage = lazy(() => import("./pages/production/BoardPage").then(({ BoardPage }) => ({ default: BoardPage })));
const KanbanPage = lazy(() => import("./pages/production/KanbanPage").then(({ KanbanPage }) => ({ default: KanbanPage })));
const LoadPage = lazy(() => import("./pages/production/LoadPage").then(({ LoadPage }) => ({ default: LoadPage })));
const ProjectsPage = lazy(() => import("./pages/production/ProjectsPage").then(({ ProjectsPage }) => ({ default: ProjectsPage })));
const ProjectDetailPage = lazy(() => import("./pages/production/ProjectDetailPage").then(({ ProjectDetailPage }) => ({ default: ProjectDetailPage })));
const ProjectWorkSessionPage = lazy(() => import("./pages/production/ProjectWorkSessionPage").then(({ ProjectWorkSessionPage }) => ({ default: ProjectWorkSessionPage })));
const FlowLabWorkspacePage = lazy(() => import("./pages/production/FlowLabWorkspacePage").then(({ FlowLabWorkspacePage }) => ({ default: FlowLabWorkspacePage })));
const OrderIntakePage = lazy(() => import("./pages/production/OrderIntakePage").then(({ OrderIntakePage }) => ({ default: OrderIntakePage })));
const SurveyPage = lazy(() => import("./pages/production/SurveyPage").then(({ SurveyPage }) => ({ default: SurveyPage })));
const ImportInboxPage = lazy(() => import("./pages/production/ImportInboxPage").then(({ ImportInboxPage }) => ({ default: ImportInboxPage })));
const ImportRunDetailPage = lazy(() => import("./pages/production/ImportRunDetailPage").then(({ ImportRunDetailPage }) => ({ default: ImportRunDetailPage })));
const ImportWorkNumberDetailPage = lazy(() => import("./pages/production/ImportWorkNumberDetailPage").then(({ ImportWorkNumberDetailPage }) => ({ default: ImportWorkNumberDetailPage })));
const TechnicalPreparationPage = lazy(() => import("./pages/production/TechnicalPreparationPage").then(({ TechnicalPreparationPage }) => ({ default: TechnicalPreparationPage })));
const ComponentWorkspacePage = lazy(() => import("./pages/production/ComponentWorkspacePage").then(({ ComponentWorkspacePage }) => ({ default: ComponentWorkspacePage })));
const OperationWorkspacePage = lazy(() => import("./pages/production/OperationWorkspacePage").then(({ OperationWorkspacePage }) => ({ default: OperationWorkspacePage })));

function LeafRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="route-loading-status" role="status" aria-live="polite">Oldal betöltése…</div>}>
      {children}
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="board" element={<LeafRoute><BoardPage /></LeafRoute>} />
        <Route path="kanban" element={<LeafRoute><KanbanPage /></LeafRoute>} />
        <Route path="load" element={<LeafRoute><LoadPage /></LeafRoute>} />
      </Route>
      <Route element={<ProductShell />}>
        <Route index element={<LeafRoute><HomePage /></LeafRoute>} />
        <Route path="orders" element={<LeafRoute><OrdersPage /></LeafRoute>} />
        <Route path="orders/:projectKey" element={<LeafRoute><OrderDetailPage /></LeafRoute>} />
        <Route path="orders/:projectKey/survey" element={<LeafRoute><SurveyPage /></LeafRoute>} />
        <Route path="orders/:projectKey/technical-preparation" element={<LeafRoute><TechnicalPreparationPage /></LeafRoute>} />
        <Route path={componentWorkspaceRoutePattern} element={<LeafRoute><ComponentWorkspacePage /></LeafRoute>} />
        <Route path={operationWorkspaceRoutePattern} element={<LeafRoute><OperationWorkspacePage /></LeafRoute>} />
        <Route path="projects" element={<LeafRoute><ProjectsPage /></LeafRoute>} />
        <Route path="projects/:key/flow-lab" element={<LeafRoute><FlowLabWorkspacePage /></LeafRoute>} />
        <Route path="projects/:key" element={<LeafRoute><ProjectDetailPage /></LeafRoute>} />
        <Route path="projects/:key/work-session" element={<LeafRoute><ProjectWorkSessionPage /></LeafRoute>} />
        <Route path="orders/new" element={<LeafRoute><OrderIntakePage /></LeafRoute>} />
        <Route path="imports" element={<LeafRoute><ImportInboxPage /></LeafRoute>} />
        <Route path="imports/:importRunId/:workNumber" element={<LeafRoute><ImportWorkNumberDetailPage /></LeafRoute>} />
        <Route path="imports/:importRunId" element={<LeafRoute><ImportRunDetailPage /></LeafRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
