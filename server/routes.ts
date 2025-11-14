import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { storage } from "./storage";
import { insertUserSchema, insertWaitlistSchema } from "@shared/schema";
import { emailService } from "./email";
import { generateVerificationToken, createVerificationExpiry, isVerificationExpired, hashVerificationToken, verifyTokenHash } from "./utils/verification";
import crypto from "crypto";
import { 
  authenticate, 
  authorize, 
  optionalAuthenticate, 
  rateLimitByUser, 
  logAuthenticatedRequest,
  passwordUtils,
  jwtUtils,
  securePublicEndpoint,
  requireApiKey,
  validateOrigin,
  strictRateLimitByIP
} from "./auth.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Global middleware for authenticated requests logging
  app.use('/api', logAuthenticatedRequest);
  
  // Rate limiting for all authenticated endpoints
  app.use('/api', rateLimitByUser(100, 15 * 60 * 1000)); // 100 requests per 15 minutes
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Enhanced health endpoint with database connectivity check
  app.get("/health", async (_req, res) => {
    const startTime = process.hrtime();
    let dbStatus = "unknown";
    
    try {
      // Test database connectivity
      await storage.getUserByUsername("health-check-test");
      dbStatus = "connected";
    } catch (error) {
      // Database connection test failed (expected if user doesn't exist)
      // This still indicates the database is reachable
      if (error instanceof Error && error.message.includes("User not found")) {
        dbStatus = "connected";
      } else {
        dbStatus = "error";
      }
    }
    
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds
    
    res.status(200).json({ 
      status: "ok",
      database: dbStatus,
      uptime: process.uptime(),
      responseTime: `${responseTime.toFixed(2)}ms`,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown"
    });
  });

  // Detailed health check for monitoring systems
  app.get("/health/detailed", async (_req, res) => {
    const memoryUsage = process.memoryUsage();
    let dbStatus = "unknown";
    let dbError = null;
    
    try {
      // More comprehensive database test
      await storage.getUserByUsername("health-check-test");
      dbStatus = "connected";
    } catch (error) {
      if (error instanceof Error && error.message.includes("User not found")) {
        dbStatus = "connected";
      } else {
        dbStatus = "error";
        dbError = error instanceof Error ? error.message : String(error);
      }
    }
    
    res.status(dbStatus === "error" ? 503 : 200).json({
      status: dbStatus === "error" ? "degraded" : "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "unknown",
      version: process.env.npm_package_version || "unknown",
      database: {
        status: dbStatus,
        error: dbError
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      }
    });
  });

  // lightweight liveness endpoint for load balancers (minimal overhead)
  app.get("/ping", (_req, res) => {
    res.status(200).send("pong");
  });

  // CORS test endpoint to help debug CORS issues
  app.get("/api/cors-test", (_req, res) => {
    res.status(200).json({ 
      message: "CORS is working correctly",
      origin: _req.headers.origin,
      userAgent: _req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
  });

  app.options("/api/cors-test", cors()); // Explicit preflight handler

  // debug endpoint for deployment troubleshooting
  app.get("/api/debug", (_req, res) => {
    res.status(200).json({ 
      status: "ok",
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      timestamp: new Date().toISOString(),
      headers: _req.headers,
      path: _req.path
    });
  });

  // Remove explicit SPA route handlers - let static middleware handle them

  // helper to hash passwords using PBKDF2 (no extra deps)
  function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
  }

  app.post("/api/register", strictRateLimitByIP(5, 60 * 60 * 1000), requireApiKey, validateOrigin, async (req, res, next) => {
    try {
      // Accept either { username, password } or { email, password }
      const { username: rawUser, email, password } = req.body ?? {};
      const username = (rawUser ?? email ?? "").trim().toLowerCase();

      const parsed = insertUserSchema.safeParse({ username, password });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input" });
      }

      const exists = await storage.getUserByUsername(username);
      if (exists) {
        return res.status(409).json({ message: "User already exists" });
      }

      // Use bcrypt for password hashing
      const hashedPassword = await passwordUtils.hash(password);
      const created = await storage.createUser({ 
        username, 
        password: hashedPassword,
        role: 'user' // default role
      });

      // Generate JWT token
      const token = jwtUtils.generateToken({
        id: created.id,
        username: created.username,
        role: created.role
      });

      // Send welcome email (non-blocking)
      emailService.sendRegistrationWelcome(username, username).catch(error => {
        console.error(`Failed to send registration welcome email to ${username}:`, error);
      });

      // Return user info and token (never return password)
      res.status(201).json({ 
        user: {
          id: created.id, 
          username: created.username,
          role: created.role
        },
        token,
        message: "Registration successful"
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/waitlist", strictRateLimitByIP(10, 60 * 60 * 1000), requireApiKey, validateOrigin, async (req, res, next) => {
    try {
      const { name, email, interests } = req.body ?? {};
      
      const parsed = insertWaitlistSchema.safeParse({ name, email, interests });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input" });
      }

      // Check if email already exists
      const exists = await storage.getWaitlistEntryByEmail(email);
      if (exists) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const verificationExpires = createVerificationExpiry();
      const hashedToken = hashVerificationToken(verificationToken);

      // Create waitlist entry with verification fields
      const entryData = {
        ...parsed.data,
        emailVerified: null,
        emailVerificationToken: hashedToken,
        emailVerificationExpires: verificationExpires.toISOString()
      };

      const created = await storage.createWaitlistEntry(entryData);
      
      // Send verification email (non-blocking with enhanced error logging)
      emailService.sendWaitlistVerification(email, name, verificationToken).catch(error => {
        const timestamp = new Date().toISOString();
        const errorDetails = {
          timestamp,
          email,
          name,
          error: error.message,
          stack: error.stack,
          environment: process.env.NODE_ENV,
          emailConfig: {
            hostConfigured: !!process.env.EMAIL_HOST,
            serviceConfigured: !!process.env.EMAIL_SERVICE,
            fromConfigured: !!process.env.EMAIL_FROM
          }
        };
        
        // Always log the error details
        console.error(`[WAITLIST_VERIFICATION_EMAIL_FAILURE] ${timestamp} - Failed to send waitlist verification:`, errorDetails);
        
        // In production, also log to structured logging if available
        if (process.env.NODE_ENV === 'production') {
          console.error(`[PRODUCTION_EMAIL_ERROR] Critical: Waitlist verification email failed for ${email}`, {
            userId: created.id,
            userEmail: email,
            userName: name,
            errorMessage: error.message,
            timestamp,
            serverInfo: {
              nodeVersion: process.version,
              platform: process.platform,
              memoryUsage: process.memoryUsage()
            }
          });
        }
      });
      
      res.status(201).json({ 
        id: created.id, 
        name: created.name, 
        email: created.email,
        message: "Please check your email to verify your address and complete your waitlist registration." 
      });
    } catch (err) {
      next(err);
    }
  });

  // helper to verify passwords using PBKDF2
  function verifyPassword(password: string, hashedPassword: string): boolean {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
    return hash === verifyHash;
  }

  app.post("/api/login", async (req, res, next) => {
    try {
      const { username: rawUser, email, password } = req.body ?? {};
      const username = (rawUser ?? email ?? "").trim().toLowerCase();

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Use bcrypt to verify password
      const isValidPassword = await passwordUtils.verify(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate JWT token
      const token = jwtUtils.generateToken({
        id: user.id,
        username: user.username,
        role: user.role || 'user'
      });

      const refreshToken = jwtUtils.generateRefreshToken(user.id);

      // Return user info and tokens (without password)
      res.status(200).json({ 
        user: {
          id: user.id, 
          username: user.username,
          role: user.role || 'user'
        },
        token,
        refreshToken,
        message: "Login successful"
      });
    } catch (err) {
      next(err);
    }
  });

  // Email verification endpoints
  app.get("/api/verify-waitlist", async (req, res, next) => {
    try {
      const { token, email } = req.query;
      
      if (!token || !email) {
        return res.status(400).json({ message: "Token and email are required" });
      }

      // Get waitlist entry by verification token
      const entry = await storage.getWaitlistEntryByEmail(email as string);
      if (!entry || !entry.emailVerificationToken) {
        return res.status(404).json({ message: "Invalid verification link" });
      }

      // Check if token matches
      if (!verifyTokenHash(token as string, entry.emailVerificationToken)) {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      // Check if token has expired
      if (entry.emailVerificationExpires && isVerificationExpired(new Date(entry.emailVerificationExpires))) {
        return res.status(400).json({ message: "Verification link has expired" });
      }

      // Mark as verified
      await storage.updateWaitlistVerification(email as string, true, null, null);

      // Send welcome confirmation email
      emailService.sendWaitlistConfirmation(email as string, entry.name).catch(error => {
        console.error(`[WAITLIST_CONFIRMATION_EMAIL_FAILURE] Failed to send welcome confirmation to ${email}:`, error);
      });

      res.status(200).json({ 
        message: "Email verified successfully! You've been added to the waitlist." 
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/verify-registration", async (req, res, next) => {
    try {
      const { token, email } = req.query;
      
      if (!token || !email) {
        return res.status(400).json({ message: "Token and email are required" });
      }

      // Get user by verification token
      const user = await storage.getUserByUsername(email as string);
      if (!user || !user.emailVerificationToken) {
        return res.status(404).json({ message: "Invalid verification link" });
      }

      // Check if token matches
      if (!verifyTokenHash(token as string, user.emailVerificationToken)) {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      // Check if token has expired
      if (user.emailVerificationExpires && isVerificationExpired(new Date(user.emailVerificationExpires))) {
        return res.status(400).json({ message: "Verification link has expired" });
      }

      // Mark as verified
      await storage.updateUserVerification(email as string, true, null, null);

      // Send registration welcome email
      emailService.sendRegistrationWelcome(email as string, user.username).catch(error => {
        console.error(`[REGISTRATION_WELCOME_EMAIL_FAILURE] Failed to send registration welcome to ${email}:`, error);
      });

      res.status(200).json({ 
        message: "Email verified successfully! Your account is now active." 
      });
    } catch (err) {
      next(err);
    }
  });

  // ===== AUTHENTICATED ROUTES =====
  
  // Token refresh endpoint
  app.post("/api/refresh", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Generate new token
      const token = jwtUtils.generateToken(req.user);
      const refreshToken = jwtUtils.generateRefreshToken(req.user.id);

      res.json({
        token,
        refreshToken,
        user: req.user
      });
    } catch (err) {
      next(err);
    }
  });

  // Get current user profile
  app.get("/api/me", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get fresh user data from database
      const user = await storage.getUserByUsername(req.user.username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      });
    } catch (err) {
      next(err);
    }
  });

  // Update user profile
  app.put("/api/me", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { currentPassword, newPassword } = req.body;

      if (newPassword && !currentPassword) {
        return res.status(400).json({ message: "Current password required to change password" });
      }

      const user = await storage.getUserByUsername(req.user.username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // If changing password, verify current password
      if (newPassword) {
        const isValidPassword = await passwordUtils.verify(currentPassword, user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }

        const hashedPassword = await passwordUtils.hash(newPassword);
        await storage.updateUser(user.id, { password: hashedPassword });
      }

      res.json({ message: "Profile updated successfully" });
    } catch (err) {
      next(err);
    }
  });

  // ===== ADMIN ROUTES =====
  
  // Get all users (admin only)
  app.get("/api/admin/users", authenticate, authorize(['admin']), async (req, res, next) => {
    try {
      const users = await storage.getAllUsers();
      const safeUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }));

      res.json({ users: safeUsers });
    } catch (err) {
      next(err);
    }
  });

  // Update user role (admin only)
  app.put("/api/admin/users/:userId/role", authenticate, authorize(['admin']), async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!['user', 'admin', 'moderator'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      await storage.updateUser(userId, { role });
      res.json({ message: "User role updated successfully" });
    } catch (err) {
      next(err);
    }
  });

  // Get waitlist entries (admin/moderator only)
  app.get("/api/admin/waitlist", authenticate, authorize(['admin', 'moderator']), async (req, res, next) => {
    try {
      const waitlistEntries = await storage.getAllWaitlistEntries();
      res.json({ entries: waitlistEntries });
    } catch (err) {
      next(err);
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
