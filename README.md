# LogoMotion

Turn a brand kit into motion. LogoMotion is a browser-based studio that renders brand videos (logo builds, app icons, device mockups, type and colour, social reels) from your logo, colours and fonts, and exports them as MP4.

Everything is drawn on a canvas in your browser: the live preview, the timeline and the exported video come from the same render code, so any change shows up instantly and the export matches what you see.

## Features

- **Brand kit:** logo SVG (drop, click or paste), optional lettermark, Google or uploaded font, four colour roles (Primary, Secondary with auto, Black, White), website, tagline, credit line and social handle.
- **Brand rules enforced:** scenes can only choose colour *roles*, never raw hex values, so every scene stays on palette. Contrast checks flag risky combinations.
- **Scenes:** turn them on and off, drag to reorder, duplicate, and set each one's length, transition and options.
- **Templates:**
  - *Brand in Motion*: 16:9, about 30s. Construction grid, logo build, app icon, phone, browser, type specimen, palette, pattern, typed sign-off, end card.
  - *Brand Reel*: 4:5, about 16s, cut on the beat. Blueprint build with cursor, word build, assemble and glow, palette cards, social profile, chrome mark, giant type, colour flashes.
- **Your screens:** upload screenshots or product demo videos and show them scrolling inside a browser or phone.
- **Formats:** 16:9, 9:16, 1:1, 4:5.
- **Export:** MP4 encoded in the browser with WebCodecs (WebM fallback), PNG of the current frame, and save/open project files.
- **Undo and redo, autosave, keyboard controls** (Space to play, arrow keys to step).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
```

## Adding a scene

Create a file in `src/scenes/` that exports a `SceneDef` (name, default length, settings and a `render(rc, t, duration, params)` function), then add it to `src/scenes/registry.ts`. Use `rc.role(...)`, `rc.drawLogo(...)` and `rc.drawWordmark(...)` so the scene follows the brand kit.

## Downloads and payments

`src/state/entitlement.ts` decides who can download. The paywall is off until payments are live (`VITE_PAYWALL=off`; see `.env.example`).
