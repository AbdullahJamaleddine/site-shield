// The site is plain static HTML/CSS/JS deployed on Vercel — there is nothing to
// bundle. This build step just copies the deployable files into dist/ so that
// hosts expecting a build output have one.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "dist");

const SKIP = new Set([
  "dist",
  "node_modules",
  ".git",
  ".vercel",
  ".lovable",
  ".workspace",
  "scripts",
  "vite.config.ts",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  ".env.local",
  "firebase-key.json",
]);

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of fs.readdirSync(root)) {
  if (SKIP.has(entry)) continue;
  copy(path.join(root, entry), path.join(out, entry));
}

console.log("Static site copied to dist/");
