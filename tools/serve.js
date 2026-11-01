// Static file server for the panel harness (tools/panel-harness.html and
// tools/panel-measure.html).
//
// Those pages load ../extension/content.css and ../extension/content.js with
// relative paths, which a file:// URL cannot resolve once the page is opened
// through a preview pane — it renders as a static snapshot and the panel
// never builds. Serving the repo over http is the whole fix.
//
//   node tools/serve.js            # then open http://localhost:8731/tools/panel-harness.html
//
// Reads only, inside the repo only. No dependencies on purpose: this has to
// start in one command on a machine with nothing installed.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8731);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.normalize(path.join(ROOT, rel));
    // Never serve outside the repo, whatever the URL asks for.
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        // The harness is edited and re-measured in the same session; a cached
        // content.js silently measures the OLD panel.
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log("panel harness: http://localhost:" + PORT + "/tools/panel-harness.html"));
