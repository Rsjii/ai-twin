#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up AI Twin Project...\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ Created .env file from .env.example');
  } else {
    console.log('⚠️  .env.example not found, please create .env manually');
  }
} else {
  console.log('✅ .env file already exists');
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Generate Prisma client
console.log('\n🗄️  Generating Prisma client...');
try {
  execSync('npm run prisma:generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated');
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  process.exit(1);
}

// Run database migrations
console.log('\n🔄 Running database migrations...');
try {
  execSync('npm run prisma:migrate', { stdio: 'inherit' });
  console.log('✅ Database migrations completed');
} catch (error) {
  console.error('❌ Failed to run migrations:', error.message);
  console.log('💡 Make sure your database is running and DATABASE_URL is correct');
}

console.log('\n🎉 Setup completed!');
console.log('\n📋 Next steps:');
console.log('1. Update .env file with your configuration');
console.log('2. Run: npm run dev');
console.log('3. Open: http://localhost:3000');
console.log('\n📚 Documentation: docs/');
console.log('🧪 Tests: npm test');
