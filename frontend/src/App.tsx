import { Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import RawLitho from "./pages/RawLitho/RawLitho";
import UploadData from "./pages/UploadData/UploadData";
import DatabaseViewer from "./pages/DatabaseViewer/DatabaseViewer";

function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden px-4 pt-1.5 pb-2.5">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/raw-litho" element={<RawLitho />} />
          <Route path="/database-viewer" element={<DatabaseViewer />} />
          <Route path="/upload-data" element={<UploadData />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
