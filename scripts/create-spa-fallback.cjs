const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const fallbackPath = path.join(distDir, '404.html');

if (!fs.existsSync(distDir)) {
  console.warn('[spa-fallback] dist directory not found; skipping 404.html generation.');
  process.exit(0);
}

if (!fs.existsSync(indexPath)) {
  console.warn('[spa-fallback] dist/index.html not found; skipping 404.html generation.');
  process.exit(0);
}

try {
  fs.copyFileSync(indexPath, fallbackPath);
  console.log('[spa-fallback] Created dist/404.html for GitHub Pages fallback.');
} catch (error) {
  console.error('[spa-fallback] Failed to create fallback file:', error);
  process.exitCode = 1;
}
