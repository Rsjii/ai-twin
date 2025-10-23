import { Pool } from 'pg';
import { config } from './env';

// Create a connection pool with better settings
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5, // Reduced connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased timeout
  acquireTimeoutMillis: 10000,
  createTimeoutMillis: 10000,
  // Add retry logic
  retryDelayMs: 1000,
  retryAttempts: 3,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
  // Don't exit process, just log the error
});

// Database utility functions with retry logic
export const db = {
  // Execute a query and return results with retry
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
      } catch (error) {
        attempts++;
        console.error(`Database query error (attempt ${attempts}):`, error.message);
        
        if (attempts >= maxAttempts) {
          console.error('Database query failed after all retries:', error);
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
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
