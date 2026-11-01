import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import "./styles.css";

// Apply the saved light/dark theme before anything draws, so the first screen doesn't flash.
const savedTheme = localStorage.getItem("logomotion.theme");
document.documentElement.dataset.theme =
  savedTheme === "light" || savedTheme === "dark" ? savedTheme : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

// No StrictMode: the undo history records changes inside state updaters, which
// StrictMode would run twice in development.
createRoot(document.getElementById("root")!).render(<Root />);

if (import.meta.env.DEV) {
  // Handy for poking at playback from the console and for automated screenshots.
  import("./state/clock").then(({ clock }) => ((window as unknown as { __clock: unknown }).__clock = clock));
}
