#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning AI Twin Project...\n');

const cleanPaths = [
  'backend/dist',
  'backend/node_modules',
  'frontend/node_modules',
  'node_modules',
  '.env.local',
  '*.log'
];

cleanPaths.forEach(cleanPath => {
  const fullPath = path.join(__dirname, '..', cleanPath);
  
  if (fs.existsSync(fullPath)) {
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`✅ Removed directory: ${cleanPath}`);
      } else {
        fs.unlinkSync(fullPath);
        console.log(`✅ Removed file: ${cleanPath}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not remove: ${cleanPath} - ${error.message}`);
    }
  }
});

console.log('\n🎉 Cleanup completed!');
console.log('\n📋 To reinstall:');
console.log('1. npm install');
console.log('2. npm run setup');
