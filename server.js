const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 10000;
const DIST_DIR = path.join(__dirname, 'dist/pharmacare/browser');

app.use(compression());

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

// 2. SPA fallback: every non-file request gets index.html
//    This is what makes /admin, /doctor, /login, etc. work on refresh.
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Pharmacare SPA server running on port ${PORT}`);
});