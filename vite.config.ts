import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const root = process.cwd();

/**
 * Vercel parity for local dev:
 *  - `cleanUrls`: /shop -> /shop.html, /admin/products -> /admin/products.html
 *  - `/api/*`: runs the Vercel-style CommonJS handlers in api/ with a tiny shim.
 */
function vercelParity(): Plugin {
  return {
    name: "vercel-parity",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const pathname = url.pathname;

        // ---- API routes -----------------------------------------------------
        if (pathname.startsWith("/api/")) {
          const file = path.join(root, pathname.replace(/\/$/, "") + ".js");
          if (!fs.existsSync(file)) return next();
          try {
            delete require.cache[require.resolve(file)];
            const mod = require(file);
            const handler = mod.default || mod;
            const body = await readBody(req);
            const shimReq: any = req;
            shimReq.query = Object.fromEntries(url.searchParams.entries());
            shimReq.body = parseBody(body, req.headers["content-type"]);
            const shimRes: any = res;
            shimRes.status = (code: number) => {
              res.statusCode = code;
              return shimRes;
            };
            shimRes.json = (data: unknown) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return shimRes;
            };
            shimRes.send = (data: unknown) => {
              res.end(typeof data === "string" ? data : JSON.stringify(data));
              return shimRes;
            };
            await handler(shimReq, shimRes);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        // ---- Clean URLs -----------------------------------------------------
        if (!path.extname(pathname)) {
          const candidates = [
            path.join(root, pathname + ".html"),
            path.join(root, pathname, "index.html"),
          ];
          for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
              req.url = "/" + path.relative(root, candidate).split(path.sep).join("/");
              break;
            }
          }
        }
        next();
      });
    },
  };
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function parseBody(raw: string, contentType?: string | string[]) {
  if (!raw) return {};
  if (String(contentType || "").includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

export default defineConfig({
  root,
  publicDir: false,
  appType: "mpa",
  plugins: [vercelParity()],
  server: {
    host: true,
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
});
