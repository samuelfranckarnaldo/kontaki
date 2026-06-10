const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    var headers = {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    };
    // Service Worker precisa deste header para controlar toda a app
    if (req.url === "/sw.js") {
      headers["Service-Worker-Allowed"] = "/";
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Kontaki a correr em http://localhost:${PORT}`);
});
