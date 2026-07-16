import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./pages/production/AppShell";
import { BoardPage } from "./pages/production/BoardPage";
import { KanbanPage } from "./pages/production/KanbanPage";
import { LoadPage } from "./pages/production/LoadPage";
import { ProjectsPage } from "./pages/production/ProjectsPage";
import { ProjectDetailPage } from "./pages/production/ProjectDetailPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<BoardPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="load" element={<LoadPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:key" element={<ProjectDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
