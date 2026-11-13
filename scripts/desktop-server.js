const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8081;
const PUBLIC_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.existsSync(path.join(__dirname, '..', 'dist'))
    ? path.join(__dirname, '..', 'dist')
    : path.join('C:', 'Users', 'Osiri', 'Local Sites', 'marine-invoice', 'app', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const rawUrl = (req.url || '/').split('?')[0];
  const safePath = path.normalize(decodeURIComponent(rawUrl)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA fallback for /edit/:id, /pay/:id, /Banking, /Settings, etc.
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // Port 8081 is already serving the app
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mobile Marine Doc Desktop Server running at http://localhost:${PORT}`);
});
