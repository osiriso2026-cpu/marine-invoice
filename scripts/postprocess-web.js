const fs = require('fs');
const path = require('path');

const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found:', distDir);
  process.exit(1);
}

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="shieldRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2E8B78"/>
      <stop offset="50%" stop-color="#1A5C52"/>
      <stop offset="100%" stop-color="#0E3832"/>
    </linearGradient>
    <linearGradient id="fiberglassBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C8B47E"/>
      <stop offset="100%" stop-color="#8C7647"/>
    </linearGradient>
    <linearGradient id="envGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1488A8"/>
      <stop offset="100%" stop-color="#0A4F66"/>
    </linearGradient>
  </defs>
  <path d="M56 6 L102 22 C102 64 92 92 56 110 C20 92 10 64 10 22 Z" fill="url(#shieldRim)" stroke="#082220" stroke-width="3"/>
  <path d="M56 14 L94 27 C94 61 85 85 56 101 C27 85 18 61 18 27 Z" fill="url(#fiberglassBg)" stroke="#0E3832" stroke-width="2"/>
  <circle cx="56" cy="10" r="2" fill="#9DB5B2"/>
  <circle cx="32" cy="18" r="2" fill="#9DB5B2"/>
  <circle cx="80" cy="18" r="2" fill="#9DB5B2"/>
  <circle cx="15" cy="40" r="2" fill="#9DB5B2"/>
  <circle cx="97" cy="40" r="2" fill="#9DB5B2"/>
  <circle cx="20" cy="70" r="2" fill="#9DB5B2"/>
  <circle cx="92" cy="70" r="2" fill="#9DB5B2"/>
  <line x1="30" y1="34" x2="80" y2="82" stroke="#1E5E54" stroke-width="7" stroke-linecap="round"/>
  <line x1="82" y1="34" x2="32" y2="82" stroke="#1E5E54" stroke-width="7" stroke-linecap="round"/>
  <circle cx="30" cy="34" r="9" fill="#2A6F64" stroke="#082220" stroke-width="2"/>
  <circle cx="82" cy="34" r="8" fill="#2A6F64" stroke="#082220" stroke-width="2"/>
  <circle cx="56" cy="26" r="6" fill="none" stroke="#1A665A" stroke-width="4"/>
  <line x1="42" y1="36" x2="70" y2="36" stroke="#1A665A" stroke-width="5" stroke-linecap="round"/>
  <line x1="56" y1="32" x2="56" y2="84" stroke="#237A6B" stroke-width="7" stroke-linecap="round"/>
  <path d="M30 64 C30 82 44 90 56 92 C68 90 82 82 82 64" fill="none" stroke="#237A6B" stroke-width="6" stroke-linecap="round"/>
  <polygon points="26,66 36,60 35,71" fill="#237A6B"/>
  <polygon points="86,66 76,60 77,71" fill="#237A6B"/>
  <rect x="53.5" y="76" width="5" height="12" rx="1" fill="#082220"/>
  <rect x="50" y="79.5" width="12" height="5" rx="1" fill="#082220"/>
  <g transform="translate(64, 68)">
    <rect x="0" y="0" width="52" height="38" rx="7" fill="url(#envGrad)" stroke="#FFFFFF" stroke-width="2.5"/>
    <path d="M3 4 L26 21 L49 4" fill="none" stroke="#FFF4D2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 34 L19 20 M48 34 L33 20" stroke="#7FD4EA" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(distDir, 'logo.svg'), logoSvg, 'utf8');

const manifest = {
  name: 'Mobile Marine Doc — Invoices & Banking',
  short_name: 'Marine Doc',
  description: 'Mobile Marine Doc Invoicing, Relay Banking & Customer Payment Portal',
  start_url: './',
  display: 'standalone',
  background_color: '#10252E',
  theme_color: '#10252E',
  icons: [
    { src: './logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    { src: './logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

// 1. Update index.html to use relative './_expo/...', branded title, favicon, and PWA manifest
const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
  html = html.replace(/href="\/favicon/g, 'href="./favicon');
  html = html.replace(/<title>.*?<\/title>/i, '<title>Mobile Marine Doc — Invoices &amp; Payments</title>');
  if (!html.includes('rel="manifest"')) {
    html = html.replace(
      '</head>',
      '  <meta name="theme-color" content="#10252E" />\n  <link rel="icon" type="image/svg+xml" href="./logo.svg" />\n  <link rel="apple-touch-icon" href="./logo.png" />\n  <link rel="manifest" href="./manifest.json" />\n</head>',
    );
  }
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

// 5. Write CNAME for custom domain https://pay.mobilemarinedoc.com
fs.writeFileSync(path.join(distDir, 'CNAME'), 'pay.mobilemarinedoc.com\n', 'utf8');

console.log('Post-processed web build in:', distDir);
