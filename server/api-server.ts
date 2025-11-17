/**
 * API-only server for database connectivity
 * This server runs independently and handles only API routes
 */

import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { storage } from "./storage.js";
import { registerRoutes } from "./routes.js";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,https://webfrontend-xxjt.onrender.com/")
  .split(',')
  .map(origin => origin.trim());

console.log('CORS: Allowed origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      console.log('CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    console.log(`CORS: Checking origin: ${origin}`);
    
    if (allowedOrigins.includes(origin)) {
      console.log(`CORS: Allowed origin: ${origin}`);
      return callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from origin: ${origin}`);
      console.warn(`CORS: Allowed origins are: ${allowedOrigins.join(', ')}`);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "X-Requested-With", "Accept"],
  exposedHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));
app.use(express.json());
app.options("*", cors());
// Request logging for API endpoints only
app.use('/api', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connectivity by checking if we can query
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      service: 'api'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: errorMessage
    });
  }
});

// Register all routes from routes.ts
await registerRoutes(app);

// User API routes
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to fetch user', details: errorMessage });
  }
});

app.get('/api/users/username/:username', async (req, res) => {
  try {
    const user = await storage.getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user by username:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to fetch user', details: errorMessage });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await storage.createUser({ username, password, role: 'user' });
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to create user', details: errorMessage });
  }
});

// Waitlist API routes
app.get('/api/waitlist/:email', async (req, res) => {
  try {
    const entry = await storage.getWaitlistEntryByEmail(req.params.email);
    if (!entry) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }
    res.json(entry);
  } catch (error) {
    console.error('Error fetching waitlist entry:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to fetch waitlist entry', details: errorMessage });
  }
});

app.post('/api/waitlist', async (req, res) => {
  try {
    const { name, email, interests } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    
    const entry = await storage.createWaitlistEntry({ name, email, interests });
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
      res.status(409).json({ error: 'Email already exists in waitlist' });
    } else {
      res.status(500).json({ error: 'Failed to add to waitlist', details: errorMessage });
    }
  }
});

// Database operations endpoint for testing
app.post('/api/db/test', async (req, res) => {
  try {
    const testResult = {
      timestamp: new Date().toISOString(),
      status: 'Database connection active',
      service: 'api-server'
    };
    
    res.json({
      status: 'success',
      message: 'Database connectivity test passed',
      data: testResult
    });
  } catch (error) {
    console.error('Database test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      status: 'error',
      message: 'Database connectivity test failed',
      error: errorMessage
    });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('[API Error]:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start the API server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 API Server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'In-memory'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ API server closed');
    process.exit(0);
  });
});

export { app, server };