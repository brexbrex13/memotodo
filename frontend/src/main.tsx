import ReactDOM from "react-dom/client";
import App, { Notifications } from "./App";
import "./styles/todo.css";
import { Tooltip } from "./Tooltip";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <Tooltip />
    {new URLSearchParams(location.search).get("window") === "notifications" ? (
      <Notifications />
    ) : (
      <App />
    )}
  </>,
);
