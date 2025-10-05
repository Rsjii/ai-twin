import { Pool } from 'pg';
import { config } from './env';

// Create a connection pool
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Database utility functions
export const db = {
  // Execute a query and return results
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },

  // Get a client from the pool for transactions
  getClient: async () => {
    return await pool.connect();
  },

  // Close the pool
  close: async () => {
    await pool.end();
  }
};

export default db;
