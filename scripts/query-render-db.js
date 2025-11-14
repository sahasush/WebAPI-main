#!/usr/bin/env node

/**
 * Quick database query script for Render PostgreSQL
 */

import { Pool } from 'pg';

const DATABASE_URL = 'postgresql://euser:EvPK38gdTSWgxK4WbVhKGg5Klmfn7hHV@dpg-d47eaiu3jp1c73buv5l0-a.oregon-postgres.render.com/eirvana_db';

async function queryDatabase() {
  console.log('🔌 Connecting to Render PostgreSQL database...');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Render
    }
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected successfully!');
    
    // Basic database info
    console.log('\n📊 Database Information:');
    const dbInfo = await client.query('SELECT version(), current_database(), current_user, now()');
    console.log(`   PostgreSQL Version: ${dbInfo.rows[0].version.substring(0, 50)}...`);
    console.log(`   Database: ${dbInfo.rows[0].current_database}`);
    console.log(`   User: ${dbInfo.rows[0].current_user}`);
    console.log(`   Time: ${dbInfo.rows[0].now}`);
    
    // List all tables
    console.log('\n📋 Tables in database:');
    const tables = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tables.rows.length === 0) {
      console.log('   No tables found in public schema');
    } else {
      tables.rows.forEach(table => {
        console.log(`   📁 ${table.table_name} (${table.table_type})`);
      });
    }
    
    // Show table schemas
    for (const table of tables.rows) {
      console.log(`\n🔍 Schema for ${table.table_name}:`);
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table.table_name]);
      
      columns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'nullable' : 'not null';
        const defaultVal = col.column_default ? ` default(${col.column_default})` : '';
        console.log(`     ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });
      
      // Count records
      const count = await client.query(`SELECT COUNT(*) FROM "${table.table_name}"`);
      console.log(`     📊 Records: ${count.rows[0].count}`);
    }
    
    // If users table exists, show some sample data
    const hasUsers = tables.rows.some(t => t.table_name === 'users');
    if (hasUsers) {
      console.log('\n👥 Sample users (first 5):');
      const users = await client.query('SELECT id, username FROM users LIMIT 5');
      if (users.rows.length === 0) {
        console.log('   No users found');
      } else {
        users.rows.forEach((user, i) => {
          console.log(`   ${i + 1}. ${user.username} (${user.id})`);
        });
      }
    }
    
    // If waitlist table exists, show some sample data
    const hasWaitlist = tables.rows.some(t => t.table_name === 'waitlist');
    if (hasWaitlist) {
      console.log('\n📧 Sample waitlist entries (first 5):');
      const waitlist = await client.query('SELECT name, email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 5');
      if (waitlist.rows.length === 0) {
        console.log('   No waitlist entries found');
      } else {
        waitlist.rows.forEach((entry, i) => {
          console.log(`   ${i + 1}. ${entry.name} - ${entry.email} (${entry.created_at})`);
        });
      }
    }
    
    client.release();
    console.log('\n✅ Database query completed successfully!');
    
  } catch (error) {
    console.error('❌ Database query failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  } finally {
    await pool.end();
  }
}

// Run the query
queryDatabase().catch(console.error);