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
- **Photo mockups:** the logo on real product photos (business card, shop sign, T-shirt, coffee cup, tote bag, office wall, billboard, cap) or on your own photo, where you drag four corners onto the surface. Finishes are built from the logo's shape so they work with any logo: print, emboss, deboss, foil (gold, silver, copper or brand colour), spot gloss, neon, embroidery and engraving. The photo's own light, folds and texture show through, and the camera and light move slowly.
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

## Mockup photos

The built-in mockups live in `public/mockups/` and are listed in `src/mockup/library.ts`: each entry is a blank product photo plus the four corners of the logo area (normalised 0..1, top-left, top-right, bottom-right, bottom-left), the real shape of that area, an optional cylinder wrap for cups and caps, and a suggested finish. The photos were generated for LogoMotion with Figma AI. To add one, drop a photo in `public/mockups/` and add an entry; the compositor (`src/mockup/gl.ts`) does the rest.

## Stock photos

The photo picker searches Pexels first, then Unsplash, then Openverse (no key needed).
Keys live on the server and are used by the proxies in `api/`, so they never reach the browser:

| Source | Vercel environment variable | Get a key |
| --- | --- | --- |
| Pexels | `PEXELS_API_KEY` | https://www.pexels.com/api/ |
| Unsplash | `UNSPLASH_ACCESS_KEY` | https://unsplash.com/oauth/applications |

Add the variable for Production and Preview, then deploy. `/api/pexels?status=1` returns `{"enabled":true}` once a key is picked up.
For local `npm run dev` (no `api/` functions), use `VITE_PEXELS_API_KEY` / `VITE_UNSPLASH_ACCESS_KEY` in `.env.local` instead.

## Downloads and payments

`src/state/entitlement.ts` decides who can download. The paywall is off until payments are live (`VITE_PAYWALL=off`; see `.env.example`).
