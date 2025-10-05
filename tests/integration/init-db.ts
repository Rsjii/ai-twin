import { initializeDatabase } from './src/config/database';

async function main() {
  try {
    console.log('Starting database initialization...');
    await initializeDatabase();
    console.log('Database setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

main();
