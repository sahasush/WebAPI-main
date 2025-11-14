import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

interface DatabaseConfig {
  url: string;
  maxRetries?: number;
  baseTimeout?: number;
  maxTimeout?: number;
  retryDelay?: number;
}

// Database type detection
function detectDatabaseType(url: string): 'cloud' | 'local' {
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('@db:') || url.includes('@postgres:')) {
    return 'local';
  }
  return 'cloud';
}

export class DatabaseConnection {
  private config: DatabaseConfig;
  private pool: Pool | null = null;
  private dbType: 'cloud' | 'local';

  constructor(config: DatabaseConfig) {
    this.config = {
      maxRetries: 5,
      baseTimeout: 15000, // 15 seconds
      maxTimeout: 120000, // 2 minutes max
      retryDelay: 3000,   // 3 seconds between retries
      ...config
    };
    this.dbType = detectDatabaseType(config.url);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async connect(): Promise<boolean> {
    console.log('\n🔌 Attempting database connection...');
    console.log(`   URL: ${this.config.url.substring(0, 50)}...`);

    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      const timeout = Math.min(
        this.config.baseTimeout! * attempt,
        this.config.maxTimeout!
      );

      console.log(`\n📡 Connection attempt ${attempt}/${this.config.maxRetries} (timeout: ${timeout}ms)`);

      try {
        // Create connection pool for node-postgres
        if (!this.pool) {
          this.pool = new Pool({
            connectionString: this.config.url,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: timeout,
          });
        }

        // Test connection with a simple query and timeout
        console.log('   Testing connection...');
        const startTime = Date.now();
        
        const client = await this.pool.connect();
        
        const result = await Promise.race([
          client.query('SELECT 1 as test, NOW() as current_time'),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout)
          )
        ]) as any;

        client.release();
        
        const duration = Date.now() - startTime;
        console.log(`✅ Connection successful! (${duration}ms)`);
        console.log(`   Database time: ${result.rows[0]?.current_time || 'N/A'}`);
        return true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ Attempt ${attempt} failed: ${errorMessage}`);

        // Check for specific connection timeout issues
        if (errorMessage.includes('ConnectTimeoutError') || errorMessage.includes('fetch failed')) {
          console.log('   � Connection timeout detected - database service may be slow to respond');
        }

        if (attempt === this.config.maxRetries) {
          console.log('\n💥 All connection attempts failed!');
          console.log('🔍 Troubleshooting for Render PostgreSQL:');
          console.log('   1. Check if PostgreSQL service is fully started (can take 2-5 minutes)');
          console.log('   2. Verify DATABASE_URL format: postgresql://user:password@host:port/database');
          console.log('   3. Ensure web service is properly linked to database service');
          console.log('   4. Check Render dashboard for database service health');
          console.log('   5. Try deploying again if database was recently created');
          console.log('   6. Connection timeouts are common during initial deployment');
          return false;
        }

        console.log(`⏳ Waiting ${this.config.retryDelay}ms before retry...`);
        await this.delay(this.config.retryDelay!);
      }
    }

    return false;
  }

  async ensureSchema(): Promise<boolean> {
    if (!this.pool) {
      console.log('❌ No database connection available for schema creation');
      return false;
    }

    try {
      console.log('\n🛠️  Creating database schema...');

      const client = await this.pool.connect();

      // First, check if tables already exist
      try {
        const tableCheck = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('users', 'waitlist')
        `);
        
        if (tableCheck.rows.length >= 2) {
          console.log('✅ Database schema already exists');
          client.release();
          return true;
        }
      } catch (checkError) {
        console.log('   📊 Tables don\'t exist, creating them...');
      }

      // Enable UUID extension
      console.log('   Creating pgcrypto extension...');
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

      // Create users table
      console.log('   Creating users table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          username text NOT NULL UNIQUE,
          password text NOT NULL
        )
      `);

      // Create waitlist table
      console.log('   Creating waitlist table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          email text NOT NULL UNIQUE,
          interests text,
          created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Verify tables were created
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      client.release();

      const tableNames = tables.rows.map((t: any) => t.table_name).sort();
      console.log(`✅ Schema created successfully! Tables: ${tableNames.join(', ')}`);
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Schema creation failed: ${errorMessage}`);
      return false;
    }
  }
}

/**
 * Enhanced database setup function with robust error handling for Render
 */
export async function ensureDatabase(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('⚠️  No DATABASE_URL found - running in development mode');
    return true; // Allow development mode without database
  }

  console.log('\n🗄️  Database Setup Starting...');
  console.log('='.repeat(50));

  // Configure for Render environment with longer timeouts
  const db = new DatabaseConnection({
    url: databaseUrl,
    maxRetries: process.env.NODE_ENV === 'production' ? 8 : 3,
    baseTimeout: 20000,  // Start with 20 seconds for Render
    maxTimeout: 180000,  // Up to 3 minutes for slow connections
    retryDelay: 5000     // 5 second delays for Render
  });

  // Attempt connection with retries
  const connected = await db.connect();
  if (!connected) {
    console.log('\n❌ Database connection failed after all retries');
    console.log('📝 App will continue starting but database features will be unavailable');
    return false;
  }

  // Ensure schema exists
  const schemaReady = await db.ensureSchema();
  if (!schemaReady) {
    console.log('\n⚠️  Schema setup failed - database connected but tables may be missing');
    return false;
  }

  console.log('\n✅ Database setup complete!');
  console.log('='.repeat(50));
  return true;
}