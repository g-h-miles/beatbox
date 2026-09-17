import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import BeatGenerator from "./BeatGenerator";
import TrainingCapture from "./TrainingCapture";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/teach" ? (
      <TrainingCapture />
    ) : window.location.pathname === "/make" ? (
      <BeatGenerator />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
