const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 10000;
const DIST_DIR = path.join(__dirname, 'dist/pharmacare/browser');

app.use(compression());

// Render health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'pharmacare-frontend' });
});

// 1. Serve real static files (JS, CSS, images, fonts, etc.)
app.use(express.static(DIST_DIR, {
  index: false,
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// 2. SPA fallback: every non-file request gets index.html.
//    This is what makes /admin, /doctor, /login, etc. work on refresh.
//    Requests that look like files (e.g. /foo.js, /assets/x.png) are NOT
//    rewritten — they fall through and 404 if the asset is missing.
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// 3. Explicit 404 for unknown assets (helps debugging, avoids SPA interception)
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`Pharmacare SPA server running on port ${PORT}`);
});