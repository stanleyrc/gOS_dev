const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3001", 10);
const ROOT = process.argv[2] || ".";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bam": "application/octet-stream",
  ".bai": "application/octet-stream",
  ".arrow": "application/octet-stream",
  ".wasm": "application/wasm",
};

function serveFile(req, res, filePath, stats) {
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const fileSize = stats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
      res.end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, path.normalize(new URL(req.url, "http://localhost").pathname));

  if (filePath.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const hasExtension = path.extname(filePath) !== "";
      if (hasExtension) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      filePath = path.join(ROOT, "index.html");
      fs.stat(filePath, (err2, stats2) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        serveFile(req, res, filePath, stats2);
      });
      return;
    }
    serveFile(req, res, filePath, stats);
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${path.resolve(ROOT)} on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop the server.");
});
