import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { uiConfig } from "./config/uiConfig";
import "./css/index.css";

document.title = uiConfig.appName;

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root element.");
createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
