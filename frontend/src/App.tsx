import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import RawLitho from "./pages/RawLitho/RawLitho";
import UploadData from "./pages/UploadData/UploadData";
import DatabaseViewer from "./pages/DatabaseViewer/DatabaseViewer";
import AccessDenied from "./pages/AccessDenied/AccessDenied";
import { useAccessCheck } from "./hooks/useAccessCheck";

// Home (pages/Home.tsx) is hidden for now: the root, and any unknown
// address, opens Raw Litho instead of a blank page.
// Only members of the allowed AD group see the app (services/websiteAccess.ts).
function App() {
  const { access, retry } = useAccessCheck();

  if (access?.status !== "allowed") {
    return <AccessDenied access={access} onRetry={retry} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="relative flex h-screen min-w-0 flex-1 flex-col overflow-hidden px-4 pt-3 pb-3 [&_h1]:pr-10">
        <KeyboardShortcuts />
        <Routes>
          <Route path="/raw-litho" element={<RawLitho />} />
          <Route path="/database-viewer" element={<DatabaseViewer />} />
          <Route path="/upload-data" element={<UploadData />} />
          <Route path="*" element={<Navigate to="/raw-litho" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
