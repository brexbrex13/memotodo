import ReactDOM from "react-dom/client";
import App, { Notifications } from "./App";
import "./styles/todo.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("window") === "notifications" ? (
    <Notifications />
  ) : (
    <App />
  ),
);
