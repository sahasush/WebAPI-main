#!/usr/bin/env node

/**
 * Pre-deployment environment logging script
 * This runs during the build phase on Render to help debug deployment issues
 */

console.log('\n' + '🚀'.repeat(40));
console.log('🔧 RENDER PRE-DEPLOYMENT ENVIRONMENT CHECK');
console.log('🚀'.repeat(40));

console.log('\n⏰ Build Timestamp:', new Date().toISOString());
console.log('🖥️  Build Platform:', process.platform, process.arch);
console.log('🟢 Node.js Version:', process.version);
console.log('📁 Build Directory:', process.cwd());
console.log('🆔 Build Process ID:', process.pid);

// Check if we're in Render environment
const isRender = process.env.RENDER === 'true';
console.log('\n☁️  Environment Detection:');
console.log(`   Running on Render: ${isRender ? '✅ YES' : '❌ NO'}`);
console.log(`   Build Environment: ${process.env.NODE_ENV || 'undefined'}`);

if (isRender) {
  console.log('\n🏗️  Render Build Information:');
  console.log(`   Service ID: ${process.env.RENDER_SERVICE_ID || 'Not available'}`);
  console.log(`   Service Name: ${process.env.RENDER_SERVICE_NAME || 'Not available'}`);
  console.log(`   Git Commit: ${process.env.RENDER_GIT_COMMIT || 'Not available'}`);
  console.log(`   Git Branch: ${process.env.RENDER_GIT_BRANCH || 'Not available'}`);
  console.log(`   Service Type: ${process.env.RENDER_SERVICE_TYPE || 'Not available'}`);
  console.log(`   Discovery Service: ${process.env.RENDER_DISCOVERY_SERVICE || 'Not available'}`);
}

// Check for database configuration
console.log('\n🗄️  Database Configuration:');
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  console.log('   DATABASE_URL: ✅ SET');
  console.log(`   Length: ${databaseUrl.length} characters`);
  console.log(`   Protocol: ${databaseUrl.startsWith('postgresql://') ? 'PostgreSQL ✅' : 'Unknown ❓'}`);
  
  try {
    const url = new URL(databaseUrl);
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Port: ${url.port || 'default'}`);
    console.log(`   Database: ${url.pathname.replace('/', '')}`);
    console.log(`   Username: ${url.username || 'not specified'}`);
    console.log(`   Has Password: ${url.password ? '✅ YES' : '❌ NO'}`);
    console.log(`   SSL Mode: ${url.searchParams.get('sslmode') || 'not specified'}`);
  } catch (error) {
    console.log(`   ❌ URL Parse Error: ${error.message}`);
  }
} else {
  console.log('   DATABASE_URL: ❌ NOT SET');
  console.log('   ⚠️  This will cause deployment failure!');
}

// Check other critical environment variables
console.log('\n🔧 Service Configuration:');
console.log(`   PORT: ${process.env.PORT || 'default (5000)'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);

// Email service check
console.log('\n📧 Email Service Configuration:');
const hasEmailConfig = process.env.EMAIL_HOST || process.env.EMAIL_SERVICE;
console.log(`   Email Service: ${hasEmailConfig ? '✅ Configured' : '🔧 Dev Mode (Console Only)'}`);

// Memory and system info
const mem = process.memoryUsage();
console.log('\n💾 System Resources:');
console.log(`   RSS Memory: ${Math.round(mem.rss / 1024 / 1024)}MB`);
console.log(`   Heap Total: ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
console.log(`   Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);

// File system check
console.log('\n📁 File System Check:');
try {
  const fs = await import('fs');
  const files = fs.readdirSync('.');
  console.log(`   Files in current directory: ${files.length}`);
  console.log(`   Key files present:`);
  console.log(`     package.json: ${files.includes('package.json') ? '✅' : '❌'}`);
  console.log(`     server/ directory: ${files.includes('server') ? '✅' : '❌'}`);
  console.log(`     scripts/ directory: ${files.includes('scripts') ? '✅' : '❌'}`);
  console.log(`     migrate.js: ${files.includes('scripts') && fs.readdirSync('scripts').includes('migrate.js') ? '✅' : '❌'}`);
} catch (error) {
  console.log(`   ❌ File system check failed: ${error.message}`);
}

// Environment variables summary
const allEnvVars = Object.keys(process.env);
console.log('\n🌍 Environment Variables Summary:');
console.log(`   Total variables: ${allEnvVars.length}`);

// Critical variables check
const criticalVars = ['DATABASE_URL', 'NODE_ENV', 'PORT'];
console.log('\n🔑 Critical Variables Status:');
criticalVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`   ${varName}: ${value ? '✅ SET' : '❌ NOT SET'}`);
});

// List all variables (with sensitive ones masked)
console.log('\n📋 All Environment Variables:');
allEnvVars.sort().forEach(key => {
  const value = process.env[key] || '';
  const sensitiveKeys = ['password', 'pass', 'secret', 'key', 'token', 'auth', 'api'];
  const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s));
  
  let displayValue = value;
  if (isSensitive && value.length > 8) {
    displayValue = `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
  } else if (isSensitive && value) {
    displayValue = '*'.repeat(value.length);
  }
  
  console.log(`   ${key}: ${displayValue || '(empty)'}`);
});

console.log('\n' + '🚀'.repeat(40));
console.log('✅ PRE-DEPLOYMENT ENVIRONMENT CHECK COMPLETE');
console.log('🚀'.repeat(40));

// Exit successfully so build continues
process.exit(0);