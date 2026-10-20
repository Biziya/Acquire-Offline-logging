import { Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import RawLitho from "./pages/RawLitho/RawLitho";
import UploadData from "./pages/UploadData/UploadData";
import "./css/App.css";

function App() {
  return (
    <div className="app-layout">
      <Sidebar />

      <main className="page-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/raw-litho" element={<RawLitho />} />
          <Route path="/upload-data" element={<UploadData />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
