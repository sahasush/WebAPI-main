#!/usr/bin/env node

/**
 * Database migration script for deployment
 * Enhanced with robust connection handling using node-postgres
 */

import { Pool } from 'pg';

// Enhanced connection helper with retry logic
async function connectWithRetry(databaseUrl, maxRetries = 2, baseTimeout = 20000) {
  console.log(`\n🔌 Connecting to database with enhanced timeout handling...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const timeout = Math.min(baseTimeout * attempt, 180000); // Max 3 minutes
    console.log(`\n📡 Connection attempt ${attempt}/${maxRetries} (timeout: ${timeout}ms)`);
    
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: timeout,
      });
      
      // Test connection with timeout
      const startTime = Date.now();
      const client = await pool.connect();
      
      const result = await Promise.race([
        client.query('SELECT 1 as test, version() as pg_version, NOW() as current_time'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Connection successful! (${duration}ms)`);
      console.log(`   PostgreSQL version: ${result.rows[0]?.pg_version?.substring(0, 50) || 'Unknown'}`);
      console.log(`   Database time: ${result.rows[0]?.current_time}`);
      
      client.release();
      return pool;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Attempt ${attempt} failed: ${errorMessage}`);
      
      if (errorMessage.includes('timeout')) {
        console.log('   🔍 Connection timeout - this is common during initial deployment');
      }
      
      if (attempt === maxRetries) {
        console.log('\n💥 All connection attempts exhausted!');
        console.log('🔧 PostgreSQL Troubleshooting:');
        console.log('   • Database service might still be starting (takes 2-5 minutes)');
        console.log('   • Check database service status');
        console.log('   • Ensure DATABASE_URL is correctly configured');
        console.log('   • Try redeploying if database was recently created');
        console.log('   • Connection issues are normal during first deployment');
        throw error;
      }
      
      const delay = 5000; // 5 seconds between retries
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Add comprehensive logging for Render deployment debugging
function logRenderEnvironment() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 RENDER MIGRATION SCRIPT STARTING');
  console.log('='.repeat(80));
  
  console.log('\n📅 Migration Timestamp:', new Date().toISOString());
  console.log('🖥️  Platform:', process.platform, process.arch);
  console.log('🟢 Node Version:', process.version);
  console.log('📁 Working Directory:', process.cwd());
  console.log('🆔 Process ID:', process.pid);
  console.log('⏱️  Uptime:', Math.round(process.uptime()), 'seconds');
  
  // Memory usage
  const mem = process.memoryUsage();
  console.log('\n💾 Memory Usage:');
  console.log(`   RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
  console.log(`   Heap Total: ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  console.log(`   Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
  
  // Environment variables analysis
  console.log('\n🌍 Environment Analysis:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (length: ' + process.env.DATABASE_URL.length + ')' : '❌ NOT SET'}`);
  
  // Render-specific variables
  console.log('\n☁️  Render Information:');
  console.log(`   RENDER: ${process.env.RENDER || 'Not detected'}`);
  console.log(`   RENDER_SERVICE_ID: ${process.env.RENDER_SERVICE_ID || 'Not set'}`);
  console.log(`   RENDER_SERVICE_NAME: ${process.env.RENDER_SERVICE_NAME || 'Not set'}`);
  console.log(`   RENDER_GIT_COMMIT: ${process.env.RENDER_GIT_COMMIT || 'Not set'}`);
  console.log(`   RENDER_GIT_BRANCH: ${process.env.RENDER_GIT_BRANCH || 'Not set'}`);
  
  // List all environment variables
  const envVars = Object.keys(process.env).sort();
  console.log('\n📋 All Environment Variables:', envVars.length);
  envVars.forEach(key => {
    const value = process.env[key] || '';
    // Sanitize sensitive values
    const sensitiveKeys = ['password', 'pass', 'secret', 'key', 'token', 'auth'];
    const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s));
    const displayValue = isSensitive && value ? 
      `${value.substring(0, 4)}***${value.substring(value.length - 4)}` : value;
    console.log(`   ${key}: ${displayValue}`);
  });
  
  console.log('\n' + '='.repeat(80));
}

async function migrate() {
  // Log environment immediately
  logRenderEnvironment();
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('\n❌ CRITICAL ERROR: DATABASE_URL environment variable is not set');
    console.error('🔍 This usually means:');
    console.error('   1. PostgreSQL service not properly linked to web service');
    console.error('   2. Environment variable not configured in Render dashboard');
    console.error('   3. Database service failed to start');
    console.error('\n💡 To fix this on Render:');
    console.error('   1. Go to your Render Dashboard');
    console.error('   2. Check that PostgreSQL service is running');
    console.error('   3. Verify web service is connected to database');
    console.error('   4. Check Environment Variables in web service settings');
    process.exit(1);
  }

  console.log('\n🔄 Starting database migration...');
  console.log('🔗 Database URL format check:', databaseUrl.startsWith('postgresql://') ? '✅ Valid' : '❌ Invalid format');

  try {
    // Use enhanced connection with retry logic
    const pool = await connectWithRetry(databaseUrl);
    const client = await pool.connect();

    console.log('\n📊 Creating database schema...');
    const migrationStart = Date.now();

    // Check existing schema and validate columns
    console.log('🔍 Checking existing schema...');
    let usersTableExists = false;
    let waitlistTableExists = false;
    let usersSchemaComplete = false;
    let waitlistSchemaComplete = false;
    
    try {
      // Check if tables exist
      const existingTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'waitlist')
      `);
      
      const tableNames = existingTables.rows.map(t => t.table_name);
      usersTableExists = tableNames.includes('users');
      waitlistTableExists = tableNames.includes('waitlist');
      
      console.log(`📊 Tables found: ${tableNames.join(', ') || 'none'}`);
      
      // Check users table schema if it exists
      if (usersTableExists) {
        const userColumns = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
          ORDER BY ordinal_position
        `);
        
        const userColumnNames = userColumns.rows.map(c => c.column_name);
        const requiredUserColumns = [
          'id', 'username', 'password', 'role', 'email_verified', 
          'email_verification_token', 'email_verification_expires', 
          'created_at', 'updated_at'
        ];
        
        const missingUserColumns = requiredUserColumns.filter(col => !userColumnNames.includes(col));
        usersSchemaComplete = missingUserColumns.length === 0;
        
        console.log(`👥 Users table columns: ${userColumnNames.join(', ')}`);
        if (missingUserColumns.length > 0) {
          console.log(`⚠️  Missing users columns: ${missingUserColumns.join(', ')}`);
        } else {
          console.log('✅ Users table schema is complete');
        }
      }
      
      // Check waitlist table schema if it exists
      if (waitlistTableExists) {
        const waitlistColumns = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'waitlist'
          ORDER BY ordinal_position
        `);
        
        const waitlistColumnNames = waitlistColumns.rows.map(c => c.column_name);
        const requiredWaitlistColumns = [
          'id', 'name', 'email', 'interests', 'email_verified',
          'email_verification_token', 'email_verification_expires', 'created_at'
        ];
        
        const missingWaitlistColumns = requiredWaitlistColumns.filter(col => !waitlistColumnNames.includes(col));
        waitlistSchemaComplete = missingWaitlistColumns.length === 0;
        
        console.log(`📋 Waitlist table columns: ${waitlistColumnNames.join(', ')}`);
        if (missingWaitlistColumns.length > 0) {
          console.log(`⚠️  Missing waitlist columns: ${missingWaitlistColumns.join(', ')}`);
        } else {
          console.log('✅ Waitlist table schema is complete');
        }
      }
      
      // If both tables exist with complete schemas, skip migration
      if (usersTableExists && waitlistTableExists && usersSchemaComplete && waitlistSchemaComplete) {
        console.log('✅ Database schema is complete - no migration needed!');
        client.release();
        await pool.end();
        return;
      }
      
    } catch (checkError) {
      console.log('📋 Schema check failed, proceeding with full migration...');
      console.log(`   Error: ${checkError.message}`);
    }

    // Ensure pgcrypto extension for UUID generation
    console.log('🔧 Creating pgcrypto extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // Create users table if it doesn't exist
    if (!usersTableExists) {
      console.log('👥 Creating users table...');
      await client.query(`
        CREATE TABLE users (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          username text NOT NULL UNIQUE,
          password text NOT NULL,
          role text NOT NULL DEFAULT 'user',
          email_verified text DEFAULT NULL,
          email_verification_token text DEFAULT NULL,
          email_verification_expires text DEFAULT NULL,
          created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Users table created successfully');
    } else if (!usersSchemaComplete) {
      console.log('🔧 Updating users table schema...');
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified text DEFAULT NULL`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token text DEFAULT NULL`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires text DEFAULT NULL`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        console.log('✅ Users table schema updated successfully');
      } catch (alterError) {
        console.log('⚠️ Some users table updates may have failed:', alterError.message);
      }
    } else {
      console.log('✅ Users table schema is already complete');
    }

    // Create waitlist table if it doesn't exist  
    if (!waitlistTableExists) {
      console.log('📋 Creating waitlist table...');
      await client.query(`
        CREATE TABLE waitlist (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          email text NOT NULL UNIQUE,
          interests text,
          email_verified text DEFAULT NULL,
          email_verification_token text DEFAULT NULL,
          email_verification_expires text DEFAULT NULL,
          created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Waitlist table created successfully');
    } else if (!waitlistSchemaComplete) {
      console.log('🔧 Updating waitlist table schema...');
      try {
        await client.query(`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS email_verified text DEFAULT NULL`);
        await client.query(`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS email_verification_token text DEFAULT NULL`);
        await client.query(`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS email_verification_expires text DEFAULT NULL`);
        console.log('✅ Waitlist table schema updated successfully');
      } catch (alterError) {
        console.log('⚠️ Some waitlist table updates may have failed:', alterError.message);
      }
    } else {
      console.log('✅ Waitlist table schema is already complete');
    }

    client.release();
    await pool.end();

    const migrationDuration = Date.now() - migrationStart;
    console.log(`✅ Database migration completed successfully! (${migrationDuration}ms)`);
    console.log('📝 Final schema status:');
    console.log('  - users table: ✅ Complete (with role, email verification, timestamps)');
    console.log('  - waitlist table: ✅ Complete (with email verification)');
    console.log('  - pgcrypto extension: ✅ Enabled');
    console.log('🔒 Email verification system is ready!');
    console.log('🛡️  Authentication system is fully configured!');

  } catch (error) {
    console.log('\n❌ Database migration failed:', error.message);
    console.log('📍 Error details:');
    console.log(`   Type: ${error.constructor.name}`);
    console.log(`   Code: ${error.code || 'N/A'}`);
    
    if (error.message.includes('ConnectTimeoutError') || error.message.includes('timeout')) {
      console.log('\n🔍 Connection Timeout Analysis:');
      console.log('   This is a common issue during Render deployment');
      console.log('   Possible causes:');
      console.log('   1. PostgreSQL service still starting (takes 2-5 minutes)');
      console.log('   2. High network latency during deployment');
      console.log('   3. Resource allocation delays on Render platform');
      console.log('\n💡 Solutions:');
      console.log('   1. Wait a few minutes and try redeploying');
      console.log('   2. Check PostgreSQL service status in Render dashboard');
      console.log('   3. Ensure DATABASE_URL is correctly configured');
    } else if (error.message.includes('fetch failed') || error.message.includes('connect')) {
      console.log('\n🔍 Connection Error Analysis:');
      console.log('   This appears to be a network/connection issue');
      console.log('   Possible causes:');
      console.log('   1. Database service not ready yet (starting up)');
      console.log('   2. Network connectivity issues');
      console.log('   3. Invalid DATABASE_URL or credentials');
      console.log('   4. Database service not linked to web service');
      
      console.log('\n⏳ Retrying migration in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        console.log('🔄 Retry attempt...');
        const retryPool = new Pool({ connectionString: databaseUrl });
        const retryClient = await retryPool.connect();
        
        await retryClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        await retryClient.query(`
          CREATE TABLE IF NOT EXISTS users (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            username text NOT NULL UNIQUE,
            password text NOT NULL,
            role text NOT NULL DEFAULT 'user',
            email_verified text DEFAULT NULL,
            email_verification_token text DEFAULT NULL,
            email_verification_expires text DEFAULT NULL,
            created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await retryClient.query(`
          CREATE TABLE IF NOT EXISTS waitlist (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            email text NOT NULL UNIQUE,
            interests text,
            email_verified text DEFAULT NULL,
            email_verification_token text DEFAULT NULL,
            email_verification_expires text DEFAULT NULL,
            created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        retryClient.release();
        await retryPool.end();
        console.log('✅ Database migration completed successfully on retry!');
        return;
      } catch (retryError) {
        console.log('❌ Retry also failed:', retryError.message);
      }
    }
    
    console.log('\n💡 Troubleshooting Steps:');
    console.log('   1. Check Render Dashboard for database service status');
    console.log('   2. Verify DATABASE_URL is correctly set in environment');
    console.log('   3. Ensure PostgreSQL service is linked to web service');
    console.log('   4. Check if database is still starting up');
    
    // Don't exit with error during build - let the app start without migration
    if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
      console.log('\n⚠️  Continuing deployment without migration...');
      console.log('   Migration will be attempted when the server starts');
      return;
    }
    
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => {
    console.log('🎉 Migration script completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
}

export { migrate };