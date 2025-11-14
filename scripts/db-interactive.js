#!/usr/bin/env node

/**
 * Interactive database query tool for Render PostgreSQL
 * Usage: node scripts/db-interactive.js "SELECT * FROM users"
 */

import { Pool } from 'pg';

const DATABASE_URL = 'postgresql://euser:EvPK38gdTSWgxK4WbVhKGg5Klmfn7hHV@dpg-d47eaiu3jp1c73buv5l0-a.oregon-postgres.render.com/eirvana_db';

async function runQuery(sql) {
  console.log(`🔍 Executing: ${sql}`);
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    const startTime = Date.now();
    const result = await client.query(sql);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Query completed in ${duration}ms`);
    
    if (result.command === 'SELECT') {
      console.log(`📊 Found ${result.rowCount} rows:`);
      if (result.rows.length > 0) {
        console.table(result.rows);
      } else {
        console.log('   No rows returned');
      }
    } else {
      console.log(`📝 ${result.command}: ${result.rowCount} rows affected`);
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Query failed:', error.message);
  } finally {
    await pool.end();
  }
}

// Get SQL from command line argument
const sql = process.argv[2];

if (!sql) {
  console.log('🔧 Usage: node scripts/db-interactive.js "YOUR SQL QUERY"');
  console.log('\n📖 Examples:');
  console.log('   node scripts/db-interactive.js "SELECT * FROM users"');
  console.log('   node scripts/db-interactive.js "INSERT INTO users (username, password) VALUES (\'test\', \'pass\')"');
  console.log('   node scripts/db-interactive.js "SELECT COUNT(*) as total FROM waitlist"');
  process.exit(1);
}

runQuery(sql).catch(console.error);