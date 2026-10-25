import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import RawLitho from "./pages/RawLitho/RawLitho";
import UploadData from "./pages/UploadData/UploadData";
import DatabaseViewer from "./pages/DatabaseViewer/DatabaseViewer";

// Home (pages/Home.tsx) is hidden for now: the root, and any unknown
// address, opens Raw Litho instead of a blank page.
function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden px-4 pt-1.5 pb-2.5">
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
