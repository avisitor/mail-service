#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function validateHTML(filePath) {
  console.log(`\n🔍 Validating HTML: ${filePath}`);
  
  const html = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  // Check for duplicate IDs
  const idMatches = html.match(/id=["'][^"']+["']/g);
  if (idMatches) {
    const ids = idMatches.map(m => m.match(/id=["']([^"']+)["']/)[1]);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      issues.push(`Duplicate IDs found: ${[...new Set(duplicates)].join(', ')}`);
    }
  }

  // Check for unclosed select tags
  const selectOpen = (html.match(/<select[^>]*>/g) || []).length;
  const selectClose = (html.match(/<\/select>/g) || []).length;
  if (selectOpen !== selectClose) {
    issues.push(`Unclosed select tags: ${selectOpen} open, ${selectClose} close`);
  }

  // Check for unclosed form tags
  const formOpen = (html.match(/<form[^>]*>/g) || []).length;
  const formClose = (html.match(/<\/form>/g) || []).length;
  if (formOpen !== formClose) {
    issues.push(`Unclosed form tags: ${formOpen} open, ${formClose} close`);
  }

  // Check for unclosed div tags
  const divOpen = (html.match(/<div[^>]*>/g) || []).length;
  const divClose = (html.match(/<\/div>/g) || []).length;
  if (divOpen !== divClose) {
    issues.push(`Unclosed div tags: ${divOpen} open, ${divClose} close`);
  }

  if (issues.length === 0) {
    console.log('✅ HTML validation passed');
    return true;
  } else {
    console.log('❌ HTML validation issues:');
    issues.forEach(issue => console.log(`  - ${issue}`));
    return false;
  }
}

// Validate the main HTML file
const htmlFile = 'src/frontend/index.html';
if (fs.existsSync(htmlFile)) {
  validateHTML(htmlFile);
} else {
  console.log(`❌ HTML file not found: ${htmlFile}`);
}