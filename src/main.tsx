import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode: the undo history records changes inside state updaters, which
// StrictMode would run twice in development.
createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.DEV) {
  // Handy for poking at playback from the console and for automated screenshots.
  import("./state/clock").then(({ clock }) => ((window as unknown as { __clock: unknown }).__clock = clock));
}
