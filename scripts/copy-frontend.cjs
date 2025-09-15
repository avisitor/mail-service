#!/usr/bin/env node
/*
 * copy-frontend.cjs
 * Copies compiled frontend JavaScript from dist back to src/frontend
 * for development server serving
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'dist', 'src', 'frontend', 'main.js');
const destPath = path.join(projectRoot, 'src', 'frontend', 'main.js');

function copyFrontend() {
  try {
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log('✅ Frontend JavaScript copied from dist to src');
    } else {
      console.log('⚠️  Compiled frontend JavaScript not found, run npm run build first');
    }
  } catch (error) {
    console.error('❌ Failed to copy frontend JavaScript:', error.message);
  }
}

// If called directly (not required)
if (require.main === module) {
  copyFrontend();
}

module.exports = { copyFrontend };