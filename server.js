import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, gzip } from "node:zlib";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(__dirname, "dist");
const root = existsSync(distRoot) ? distRoot : __dirname;

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const COMPRESSION_THRESHOLD = 1024;
const COMPRESSIBLE_EXTS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".webmanifest",
  ".csv",
  ".svg",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".csv": "text/csv; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const pathname = decoded.split("?")[0].split("#")[0];
  const clean = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(clean).replace(/^(\.\.[/\\])+/, "");
  return path.join(root, filePath);
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = safePath(req.url || "/");
    if (!filePath.startsWith(root)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const body = await readFile(filePath);
    const headers = { "Content-Type": contentType, "Cache-Control": "no-cache" };
    const acceptEncoding = String(req.headers["accept-encoding"] || "");
    const supportsBrotli = acceptEncoding.includes("br");
    const supportsGzip = acceptEncoding.includes("gzip");
    const isCompressible = COMPRESSIBLE_EXTS.has(ext);

    if (isCompressible && body.length > COMPRESSION_THRESHOLD && (supportsBrotli || supportsGzip)) {
      headers["Vary"] = "Accept-Encoding";
      if (supportsBrotli) {
        const compressed = await brotliCompressAsync(body);
        headers["Content-Encoding"] = "br";
        res.writeHead(200, headers);
        res.end(compressed);
        return;
      }
      if (supportsGzip) {
        const compressed = await gzipAsync(body);
        headers["Content-Encoding"] = "gzip";
        res.writeHead(200, headers);
        res.end(compressed);
        return;
      }
    }

    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const port = Number(process.env.PORT) || 5173;
server.listen(port, () => {
  console.log(`Pulse Feed running at http://localhost:${port}`);
});
