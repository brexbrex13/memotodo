import ReactDOM from "react-dom/client";
import App, { Notifications } from "./App";
import "./styles/todo.css";
import { Tooltip } from "./Tooltip";
import { applyTheme, Theme } from "./theme";
import { QuickAdd } from "./QuickAdd";
applyTheme((localStorage.getItem("theme") as Theme) || "light");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <Tooltip />
    {new URLSearchParams(location.search).get("window") === "notifications" ? (
      <Notifications />
    ) : new URLSearchParams(location.search).get("window") === "quick-add" ? (
      <QuickAdd />
    ) : (
      <App />
    )}
  </>,
);
