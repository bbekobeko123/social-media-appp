import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const distDir = path.join(process.cwd(), "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: ["app.js"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  target: ["es2018"],
});

await build({
  entryPoints: ["bootstrap.js"],
  outfile: "dist/bootstrap.js",
  minify: true,
  target: ["es2018"],
});

await build({
  entryPoints: ["styles-critical.css"],
  outfile: "dist/styles-critical.css",
  minify: true,
});

await build({
  entryPoints: ["styles-deferred.css"],
  outfile: "dist/styles-deferred.css",
  minify: true,
});

const staticFiles = [
  "index.html",
  "sw.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-192-maskable.png",
  "icon-512-maskable.png",
  "apple-touch-icon.png",
  "flashcards.csv",
  "features.js",
];

await Promise.all(
  staticFiles.map(async (file) => {
    await copyFile(path.join(process.cwd(), file), path.join(distDir, file));
  }),
);
