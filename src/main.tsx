import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { SharePage } from "./share/SharePage";
import "./styles.css";

// Apply the saved light/dark theme before anything draws, so the first screen doesn't flash.
const savedTheme = localStorage.getItem("logomotion.theme");
document.documentElement.dataset.theme =
  savedTheme === "light" || savedTheme === "dark" ? savedTheme : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

// No StrictMode: the undo history records changes inside state updaters, which
// StrictMode would run twice in development.
// A live brand page (/s/<id>) is public and read-only: no editor, no sign-in.
const shared = window.location.pathname.match(/^\/s\/([A-Za-z0-9]{10,32})\/?$/);
if (shared) document.documentElement.dataset.theme = "light";
createRoot(document.getElementById("root")!).render(shared ? <SharePage id={shared[1]} /> : <Root />);

if (import.meta.env.DEV) {
  // Handy for poking at playback from the console and for automated screenshots.
  import("./state/clock").then(({ clock }) => ((window as unknown as { __clock: unknown }).__clock = clock));
}
