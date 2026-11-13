const fs = require('fs');
const path = require('path');

const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found:', distDir);
  process.exit(1);
}

// 1. Update index.html to use relative './_expo/...' and dynamic base when under /marine-invoice/
const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
  html = html.replace(/href="\/favicon/g, 'href="./favicon');
  fs.writeFileSync(indexPath, html, 'utf8');
}

// 2. Update JS bundle asset URIs from "/assets/..." to "./assets/..." so fonts & icons work on both root and subpaths
const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
if (fs.existsSync(jsDir)) {
  for (const file of fs.readdirSync(jsDir)) {
    if (file.endsWith('.js')) {
      const full = path.join(jsDir, file);
      let code = fs.readFileSync(full, 'utf8');
      code = code.replace(/"\/assets\//g, '"./assets/');
      fs.writeFileSync(full, code, 'utf8');
    }
  }
}

// 3. Create 404.html for SPA deep links (/pay/INV-XXXX?d=...) on GitHub Pages / static hosts
const notFoundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Mobile Marine Doc — Redirecting…</title>
    <script>
      (function () {
        var l = window.location;
        var repo = '/marine-invoice';
        var base = l.pathname.indexOf(repo) === 0 ? repo : '';
        var target = l.pathname + l.search;
        l.replace(l.origin + base + '/?p=' + encodeURIComponent(target) + l.hash);
      })();
    </script>
  </head>
  <body></body>
</html>
`;
fs.writeFileSync(path.join(distDir, '404.html'), notFoundHtml, 'utf8');

// 4. Create .nojekyll so GitHub Pages serves the _expo/ directory
fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf8');

console.log('Post-processed web build in:', distDir);
