/**
 * Environment and configuration logging utility
 * Helps debug deployment issues by printing sanitized environment information
 */

interface LogConfig {
  hideSecrets?: boolean;
  includeEnvVars?: string[];
  excludeEnvVars?: string[];
}

export class EnvironmentLogger {
  private static sanitizeValue(key: string, value: string, hideSecrets: boolean = true): string {
    if (!hideSecrets) return value;
    
    const secretKeys = [
      'password', 'pass', 'secret', 'key', 'token', 'auth',
      'api_key', 'private', 'credential', 'oauth'
    ];
    
    const isSecret = secretKeys.some(secretKey => 
      key.toLowerCase().includes(secretKey)
    );
    
    if (isSecret && value) {
      if (value.length <= 8) {
        return '*'.repeat(value.length);
      }
      return `${value.substring(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.substring(value.length - 4)}`;
    }
    
    return value;
  }

  private static formatDatabaseUrl(url?: string): string {
    if (!url) return 'Not set';
    
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const port = parsed.port || (parsed.protocol === 'postgres:' ? '5432' : 'unknown');
      const database = parsed.pathname.replace('/', '') || 'unknown';
      const username = parsed.username || 'unknown';
      const password = parsed.password ? `${parsed.password.substring(0, 2)}***` : 'none';
      
      return `postgresql://${username}:${password}@${hostname}:${port}/${database}${parsed.search}`;
    } catch (error) {
      return `Invalid URL format: ${url.substring(0, 20)}...`;
    }
  }

  static logStartupEnvironment(config: LogConfig = {}): void {
    const { hideSecrets = true, includeEnvVars = [], excludeEnvVars = [] } = config;
    
    console.log('\n='.repeat(60));
    console.log('🚀 EIRVANA APPLICATION STARTUP');
    console.log('='.repeat(60));
    
    // Basic app information
    console.log('\n📋 Application Information:');
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Port: ${process.env.PORT || '5000'}`);
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Platform: ${process.platform} ${process.arch}`);
    console.log(`   Process ID: ${process.pid}`);
    console.log(`   Working Directory: ${process.cwd()}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    
    // Database configuration
    console.log('\n🗄️  Database Configuration:');
    console.log(`   DATABASE_URL: ${this.formatDatabaseUrl(process.env.DATABASE_URL)}`);
    console.log(`   POSTGRES_DB: ${process.env.POSTGRES_DB || 'Not set'}`);
    console.log(`   POSTGRES_USER: ${process.env.POSTGRES_USER || 'Not set'}`);
    console.log(`   POSTGRES_PASSWORD: ${this.sanitizeValue('POSTGRES_PASSWORD', process.env.POSTGRES_PASSWORD || 'Not set', hideSecrets)}`);
    console.log(`   Database Available: ${process.env.DATABASE_URL ? '✅ Yes' : '❌ No'}`);
    
    // Email configuration
    console.log('\n📧 Email Configuration:');
    console.log(`   EMAIL_HOST: ${process.env.EMAIL_HOST || 'Not set'}`);
    console.log(`   EMAIL_PORT: ${process.env.EMAIL_PORT || 'Not set'}`);
    console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || 'Not set'}`);
    console.log(`   EMAIL_PASS: ${this.sanitizeValue('EMAIL_PASS', process.env.EMAIL_PASS || 'Not set', hideSecrets)}`);
    console.log(`   EMAIL_FROM: ${process.env.EMAIL_FROM || 'Not set'}`);
    console.log(`   EMAIL_SERVICE: ${process.env.EMAIL_SERVICE || 'Not set'}`);
    console.log(`   EMAIL_API_KEY: ${this.sanitizeValue('EMAIL_API_KEY', process.env.EMAIL_API_KEY || 'Not set', hideSecrets)}`);
    console.log(`   Email Available: ${process.env.EMAIL_HOST || process.env.EMAIL_SERVICE ? '✅ Yes' : '🔧 Dev Mode (Console)'}`);
    
   // Render-specific environment
    if (process.env.RENDER) {
      console.log('\n☁️  Render Platform Information:');
      console.log(`   RENDER: ${process.env.RENDER}`);
      console.log(`   RENDER_SERVICE_ID: ${process.env.RENDER_SERVICE_ID || 'Not set'}`);
      console.log(`   RENDER_SERVICE_NAME: ${process.env.RENDER_SERVICE_NAME || 'Not set'}`);
      console.log(`   RENDER_GIT_COMMIT: ${process.env.RENDER_GIT_COMMIT || 'Not set'}`);
      console.log(`   RENDER_GIT_BRANCH: ${process.env.RENDER_GIT_BRANCH || 'Not set'}`);
    }
    
    // Memory usage
    const memUsage = process.memoryUsage();
    console.log('\n💾 Memory Usage:');
    console.log(`   RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    console.log(`   Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`   Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`   External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
    
    // Additional environment variables if requested
    if (includeEnvVars.length > 0) {
      console.log('\n🔍 Additional Environment Variables:');
      includeEnvVars.forEach(key => {
        const value = process.env[key];
        console.log(`   ${key}: ${this.sanitizeValue(key, value || 'Not set', hideSecrets)}`);
      });
    }
    
    // All environment variables (excluding common ones)
    console.log('\n🌍 Environment Variables Summary:');
    const envKeys = Object.keys(process.env).filter(key => 
      !excludeEnvVars.includes(key) &&
      !key.startsWith('npm_') &&
      !key.startsWith('_') &&
      key !== 'PATH' &&
      key !== 'PWD' &&
      key !== 'HOME' &&
      key !== 'USER' &&
      key !== 'SHELL'
    ).sort();
    
    console.log(`   Total Environment Variables: ${envKeys.length}`);
    envKeys.forEach(key => {
      const value = process.env[key] || '';
      console.log(`   ${key}: ${this.sanitizeValue(key, value, hideSecrets)}`);
    });
    
    console.log('\n='.repeat(60));
    console.log('🎯 Startup Environment Logging Complete');
    console.log('='.repeat(60));
  }

  static async testDatabaseConnection(): Promise<void> {
    console.log('\n🔍 Testing Database Connection...');
    
    if (!process.env.DATABASE_URL) {
      console.log('❌ DATABASE_URL not found - skipping connection test');
      return;
    }
    
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      
      console.log('📡 Attempting database connection...');
      const result = await sql`SELECT 1 as test_connection, NOW() as current_time`;
      
      console.log('✅ Database connection successful!');
      console.log(`   Test Query Result: ${result[0]?.test_connection}`);
      console.log(`   Database Time: ${result[0]?.current_time}`);
    } catch (error) {
      console.log('❌ Database connection failed!');
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
  }

  static async testEmailService(): Promise<void> {
    console.log('\n📧 Testing Email Service...');
    
    try {
      const { emailService } = await import('./email');
      const isConnected = await emailService.testConnection();
      
      if (isConnected) {
        console.log('✅ Email service initialized successfully');
      } else {
        console.log('⚠️  Email service not configured or failed to initialize');
      }
    } catch (error) {
      console.log('❌ Email service test failed!');
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static logSystemHealth(): void {
    console.log('\n🏥 System Health Check:');
    console.log(`   Uptime: ${Math.round(process.uptime())} seconds`);
    console.log(`   CPU Usage: ${process.cpuUsage()}`);
    console.log(`   Platform: ${process.platform} ${process.arch}`);
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  }
}