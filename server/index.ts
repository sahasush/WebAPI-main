import dotenv from "dotenv";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { EnvironmentLogger } from "./environment";
import { ensureDatabase } from "./database";

// Load environment variables from .env file
dotenv.config();

// Log startup environment immediately
EnvironmentLogger.logStartupEnvironment({
  hideSecrets: process.env.NODE_ENV === 'production',
  excludeEnvVars: ['PATH', 'PWD', 'HOME', 'USER', 'SHELL', 'TMPDIR']
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Test database and email connections during startup
  await EnvironmentLogger.testDatabaseConnection();
  await EnvironmentLogger.testEmailService();
  
  // Attempt database migration at startup if not done during build
  if (process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    console.log('\n🔄 Ensuring database schema at startup...');
    const migrationSuccess = await ensureDatabase();
    if (migrationSuccess) {
      console.log('✅ Database ready for production');
    } else {
      console.log('⚠️  Database setup incomplete - some features may not work');
    }
  }
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Default to 5000 if not specified. Attempt to use reusePort when available
  // (helps with some dev hosting providers). If the platform does not support
  // reusePort (ENOTSUP), retry without it.
  const port = parseInt(process.env.PORT || '5000', 10);

  // helper to listen and convert to Promise so we can retry on specific errors
  const listenAsync = (opts: { port: number; host: string; reusePort?: boolean; }) => {
    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error & { code?: string }) => {
        server.removeListener('listening', onListen);
        reject(err);
      };

      const onListen = () => {
        server.removeListener('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListen);
      server.listen(opts as any);
    });
  };

  (async () => {
    const maxAttempts = 10; // try port, port+1, ..., port+9
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tryPort = port + attempt;
      try {
        try {
          await listenAsync({ port: tryPort, host: '0.0.0.0', reusePort: true });
          
          // Enhanced startup logging
          console.log('\n🚀 Eirvana Server Started Successfully!');
          console.log(`   🌐 Server URL: http://0.0.0.0:${tryPort}`);
          console.log(`   📅 Started at: ${new Date().toISOString()}`);
          console.log(`   🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
          console.log(`   📊 Process ID: ${process.pid}`);
          
          // Log available endpoints
          console.log('\n📡 Available Endpoints:');
          console.log(`   GET  /health           - Basic health check`);
          console.log(`   GET  /health/detailed  - Detailed system info`);
          console.log(`   GET  /ping             - Simple ping endpoint`);
          console.log(`   POST /api/register     - User registration`);
          console.log(`   POST /api/login        - User login`);
          console.log(`   POST /api/waitlist     - Join waitlist`);
          
          // Start periodic health logging for production
          if (process.env.NODE_ENV === 'production') {
            console.log('\n🔄 Starting periodic health logging...');
            setInterval(() => {
              EnvironmentLogger.logSystemHealth();
            }, 5 * 60 * 1000); // Every 5 minutes
          }
          
          log(`serving on port ${tryPort}`);
          return;
        } catch (err: any) {
          if (err && err.code === 'ENOTSUP') {
            log('reusePort not supported on this platform, retrying without reusePort');
            await listenAsync({ port: tryPort, host: '0.0.0.0' });
            
            console.log('\n🚀 Eirvana Server Started Successfully (without reusePort)!');
            console.log(`   🌐 Server URL: http://0.0.0.0:${tryPort}`);
            console.log(`   📅 Started at: ${new Date().toISOString()}`);
            
            log(`serving on port ${tryPort}`);
            return;
          }
          throw err;
        }
      } catch (err: any) {
        console.log(`❌ Failed to start on port ${tryPort}: ${err.message}`);
        if (err && err.code === 'EADDRINUSE') {
          log(`port ${tryPort} in use, trying next port`);
          continue; // try next port
        }
        // unknown error: rethrow
        throw err;
      }
    }

    console.log('\n💥 FATAL ERROR: Could not start server!');
    console.log(`❌ Could not bind to any port in range ${port}-${port + maxAttempts - 1}`);
    console.log('🔍 Check if ports are available or if there are permission issues');
    throw new Error(`Could not bind to any port in range ${port}-${port + maxAttempts - 1}`);
  })();
})().catch(error => {
  console.log('\n💥 CRITICAL STARTUP FAILURE!');
  console.log('='.repeat(50));
  console.log(`❌ Error: ${error.message}`);
  console.log(`📍 Stack: ${error.stack}`);
  console.log(`🕐 Time: ${new Date().toISOString()}`);
  console.log(`🔧 Node: ${process.version}`);
  console.log(`🖥️  Platform: ${process.platform} ${process.arch}`);
  console.log(`📁 Working Dir: ${process.cwd()}`);
  console.log('='.repeat(50));
  
  // Log critical environment for debugging
  console.log('\n🔍 CRITICAL DEBUG INFO:');
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`PORT: ${process.env.PORT || 'undefined'}`);
  
  process.exit(1);
});
