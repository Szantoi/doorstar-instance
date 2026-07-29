import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./pages/production/AppShell";
import { ProductShell } from "./pages/production/ProductShell";
import { HomePage } from "./pages/production/HomePage";
import { OrdersPage } from "./pages/production/OrdersPage";
import { OrderDetailPage } from "./pages/production/OrderDetailPage";
import { BoardPage } from "./pages/production/BoardPage";
import { KanbanPage } from "./pages/production/KanbanPage";
import { LoadPage } from "./pages/production/LoadPage";
import { ProjectsPage } from "./pages/production/ProjectsPage";
import { ProjectDetailPage } from "./pages/production/ProjectDetailPage";
import { OrderIntakePage } from "./pages/production/OrderIntakePage";
import { SurveyPage } from "./pages/production/SurveyPage";
import { ImportInboxPage } from "./pages/production/ImportInboxPage";
import { ImportRunDetailPage } from "./pages/production/ImportRunDetailPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="board" element={<BoardPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="load" element={<LoadPage />} />
      </Route>
      <Route element={<ProductShell />}>
        <Route index element={<HomePage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:projectKey" element={<OrderDetailPage />} />
        <Route path="orders/:projectKey/survey" element={<SurveyPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:key" element={<ProjectDetailPage />} />
        <Route path="orders/new" element={<OrderIntakePage />} />
        <Route path="imports" element={<ImportInboxPage />} />
        <Route path="imports/:importRunId" element={<ImportRunDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
