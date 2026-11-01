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

## Accounts and saved projects

Anyone can open the editor and build a video without an account. **Downloading** (video, PNG, all formats) and **saving** ask for Google sign-in first. Once signed in:

- Projects (brand kit, scenes, music) save to the account as you edit, with a "Saved" indicator.
- Media files upload to a private storage folder per user, so they open on any device.
- The project switcher (top left) lists your projects with thumbnails: new (keeps your brand kit), rename, delete.
- Whatever a guest built before signing in is brought into their account automatically.

It runs on Supabase (Auth with the Google provider, Postgres, Storage). Setup:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In Google Cloud Console create an OAuth client (Web application) with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, and paste its Client ID and secret into Supabase -> Authentication -> Sign In / Providers -> Google.
3. In Supabase -> Authentication -> URL Configuration set the Site URL to the production URL and add `https://*.vercel.app/**` and `http://localhost:5173/**` as redirect URLs.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel (Production and Preview) and redeploy.

Without those two variables the app runs as before, with no sign-in and everything kept in the browser. Vite reads them at build time, so redeploy after adding or changing them.

## Downloads and payments

`src/state/entitlement.ts` decides who can download. The paywall is off until payments are live (`VITE_PAYWALL=off`; see `.env.example`).

## Onboarding, brand from a website, live brand pages

- **Onboarding** opens on a fresh project (and from **Quick start** in the top bar): pick what to make, paste a website, review the brand next to a live preview, add screenshots or files. Hebrew and English (switch at the top).
- **`/api/brand?url=`** reads a public website for the name, tagline, logo candidates, colours (sorted into primary, secondary, dark and light) and fonts (paid fonts are swapped for the closest Google font). Every request and redirect is checked against private addresses.
- **Logo maker** (onboarding and Brand → Logo): monograms and wordmarks drawn as vector outlines from the brand font, Hebrew included.
- **Live brand pages** (`Share` in the top bar, needs accounts): a public page at `/s/<id>` with the film, logo on light/dark/brand colour with SVG downloads, colour codes (HEX, RGB, CMYK), the type specimen, a scene list, and a feedback box where a client comments on a moment or approves. Run the updated `supabase/schema.sql` once to add the `shares` and `share_comments` tables, the visitor functions and the public `shared` storage bucket.
- `npm run dev` now serves the `api/` functions too.
