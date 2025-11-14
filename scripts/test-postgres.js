#!/usr/bin/env node

/**
 * Test script to verify PostgreSQL database connectivity using node-postgres
 * This works with any PostgreSQL database (local, cloud-hosted, etc.)
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { users, waitlist } from '../shared/schema.ts';

// Colors for console output
const colors = {
  green: '\x1b[32m%s\x1b[0m',
  red: '\x1b[31m%s\x1b[0m',
  yellow: '\x1b[33m%s\x1b[0m',
  blue: '\x1b[34m%s\x1b[0m',
  cyan: '\x1b[36m%s\x1b[0m'
};

async function testPostgresConnection(databaseUrl) {
  console.log(colors.cyan, '\n🔍 Testing PostgreSQL Database Connectivity');
  console.log('='.repeat(50));
  
  try {
    console.log(colors.blue, '📡 Initializing PostgreSQL pool...');
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    console.log(colors.blue, '🔗 Testing basic connection...');
    const startTime = Date.now();
    
    // Test 1: Basic connection
    const client = await pool.connect();
    const basicTest = await client.query('SELECT 1 as test, NOW() as server_time, version() as pg_version');
    const duration = Date.now() - startTime;
    
    console.log(colors.green, `✅ Basic connection successful (${duration}ms)`);
    console.log(`   Server time: ${basicTest.rows[0].server_time}`);
    console.log(`   PostgreSQL: ${basicTest.rows[0].pg_version.substring(0, 50)}...`);
    
    client.release();
    
    // Test 2: Drizzle ORM integration
    console.log(colors.blue, '\n🔧 Testing Drizzle ORM integration...');
    const db = drizzle(pool);
    
    // Test 3: Schema verification
    console.log(colors.blue, '📊 Checking schema...');
    const client2 = await pool.connect();
    const schemaCheck = await client2.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position
    `);
    
    if (schemaCheck.rows.length > 0) {
      console.log(colors.green, '✅ Schema tables found:');
      const tables = {};
      schemaCheck.rows.forEach(row => {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
      });
      
      Object.entries(tables).forEach(([tableName, columns]) => {
        console.log(`   📋 ${tableName}`);
        console.log(`      Columns: ${columns.join(', ')}`);
      });
    } else {
      console.log(colors.yellow, '⚠️  No tables found in public schema');
    }
    
    client2.release();
    
    // Test 4: Record counts (if tables exist)
    console.log(colors.blue, '\n📈 Checking record counts...');
    const client3 = await pool.connect();
    try {
      const userCount = await client3.query('SELECT COUNT(*) as count FROM users');
      const waitlistCount = await client3.query('SELECT COUNT(*) as count FROM waitlist');
      
      console.log(`   👥 Users: ${userCount.rows[0].count}`);
      console.log(`   📝 Waitlist: ${waitlistCount.rows[0].count}`);
    } catch (countError) {
      console.log(colors.yellow, '⚠️  Tables might not exist yet (normal for fresh database)');
    }
    client3.release();
    
    // Test 5: Performance test
    console.log(colors.blue, '\n⚡ Performance test (10 queries)...');
    const perfStart = Date.now();
    const perfPromises = Array(10).fill(0).map(async () => {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
    });
    
    await Promise.all(perfPromises);
    const perfDuration = Date.now() - perfStart;
    
    console.log(colors.green, `✅ 10 concurrent queries completed in ${perfDuration}ms (avg: ${(perfDuration / 10).toFixed(1)}ms)`);
    
    // Clean up
    await pool.end();
    
    console.log(colors.green, '\n🎉 PostgreSQL connectivity test PASSED!');
    return true;
    
  } catch (error) {
    console.log(colors.red, `\n❌ PostgreSQL connectivity test FAILED: ${error.message}`);
    
    if (error.message.includes('connect') || error.message.includes('timeout')) {
      console.log(colors.yellow, '\n🔍 Connection troubleshooting:');
      console.log('   • Verify database server is running and accessible');
      console.log('   • Check if DATABASE_URL is correctly formatted');
      console.log('   • Ensure firewall allows connections on the database port');
      console.log('   • For cloud databases, verify IP allowlist settings');
      console.log('   • Check if SSL/TLS settings match server requirements');
    }
    
    console.log(colors.red, '\nFull error:', error);
    return false;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.argv[2];
  
  if (!databaseUrl) {
    console.log(colors.yellow, '⚠️  No DATABASE_URL provided');
    console.log('\nUsage:');
    console.log('  DATABASE_URL="your-postgres-url" node scripts/test-postgres.js');
    console.log('  or');
    console.log('  node scripts/test-postgres.js "your-postgres-url"');
    console.log('\nExample PostgreSQL URL formats:');
    console.log('  postgresql://user:password@host:5432/database');
    console.log('  postgresql://user:password@cloud-host.com/database?sslmode=require');
    process.exit(1);
  }

  console.log('PostgreSQL Database Connectivity Test');
  console.log(`URL: ${databaseUrl.substring(0, 30)}...`);
  console.log(`Length: ${databaseUrl.length} characters`);
  
  if (databaseUrl.includes('neon.tech')) {
    console.log('Database type: Cloud PostgreSQL (Neon)');
  } else if (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')) {
    console.log('Database type: Local PostgreSQL');
  } else {
    console.log('Database type: PostgreSQL');
  }

  const success = await testPostgresConnection(databaseUrl);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});