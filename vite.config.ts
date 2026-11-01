import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Run the Vercel functions in api/ during `npm run dev`, so features that need
 * them (reading a brand from a website, screenshots, stock photos) work locally.
 */
function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([\w-]+)(\?.*)?$/);
        if (!m || m[1].startsWith("_")) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const handler = mod[req.method ?? "GET"] ?? mod.default;
          if (typeof handler !== "function") return next();
          const response: Response = await handler(new Request(`http://localhost${req.url}`, { method: req.method }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
});
