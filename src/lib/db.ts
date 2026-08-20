import { Pool } from '@neondatabase/serverless';
import { getCurrentUser } from './auth';

// Use the pooled connection string for the application
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Helper to execute a query with the current user's JWT claim set.
 * This ensures Row-Level Security (RLS) policies work correctly in Neon.
 */
export async function queryWithAuth(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const user = await getCurrentUser();
    
    await client.query('BEGIN');
    
    if (user) {
      // Set the JWT claim so auth.uid() returns the user ID
      const claim = JSON.stringify({ sub: user.id });
      await client.query(`SET LOCAL request.jwt.claims = '${claim}'`);
    } else {
      await client.query(`SET LOCAL request.jwt.claims = ''`);
    }
    
    const result = await client.query(sql, params);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
