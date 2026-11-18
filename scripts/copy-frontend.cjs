#!/usr/bin/env node
/*
 * copy-frontend.cjs
 * Copies compiled frontend JavaScript from dist back to src/frontend
 * for development server serving.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'dist', 'src', 'frontend');
const destDir = path.join(projectRoot, 'src', 'frontend');

function copyFrontend() {
  try {
    if (!fs.existsSync(sourceDir)) {
      console.log('⚠️  Compiled frontend JavaScript not found, run npm run build first');
      return;
    }

    const jsFiles = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js'));
    if (jsFiles.length === 0) {
      console.log('⚠️  No compiled frontend JavaScript found, run npm run build first');
      return;
    }

    for (const file of jsFiles) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
    }

    console.log(`✅ Frontend JavaScript copied from dist to src (${jsFiles.length} file(s))`);
  } catch (error) {
    console.error('❌ Failed to copy frontend JavaScript:', error.message);
  }
}

// If called directly (not required)
if (require.main === module) {
  copyFrontend();
}

module.exports = { copyFrontend };
