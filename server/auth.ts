/**
 * Authentication and Authorization Middleware
 * Provides JWT-based authentication and role-based authorization
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role?: string;
      };
    }
  }
}

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '24h') as string;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const API_KEY = process.env.API_KEY || 'your-api-key-change-this-in-production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://webfrontend-xxjt.onrender.com').split(',').map(origin => origin.trim());

// Password utilities using bcrypt (more secure than PBKDF2)
export const passwordUtils = {
  /**
   * Hash a password using bcrypt
   */
  hash: async (password: string): Promise<string> => {
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  /**
   * Verify a password against a hash
   */
  verify: async (password: string, hash: string): Promise<boolean> => {
    return await bcrypt.compare(password, hash);
  }
};

// JWT utilities
export const jwtUtils = {
  /**
   * Generate a JWT token for a user
   */
  generateToken: (user: { id: string; username: string; role?: string }): string => {
    const payload = { 
      id: user.id, 
      username: user.username, 
      role: user.role || 'user' 
    };
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
    
    return jwt.sign(payload, JWT_SECRET, options);
  },

  /**
   * Verify and decode a JWT token
   */
  verifyToken: (token: string): any => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  },

  /**
   * Generate a refresh token (longer lived)
   */
  generateRefreshToken: (userId: string): string => {
    const payload = { id: userId, type: 'refresh' };
    const options: SignOptions = { expiresIn: '7d' as any };
    
    return jwt.sign(payload, JWT_SECRET, options);
  }
};

/**
 * Authentication middleware - requires valid JWT token
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for token in Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No token provided' 
      });
    }

    // Verify token
    const decoded = jwtUtils.verifyToken(token);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Invalid or expired token' 
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (token) {
      try {
        const decoded = jwtUtils.verifyToken(token);
        req.user = {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role
        };
      } catch (error) {
        // Token invalid but don't fail - just proceed without user
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Must be logged in to access this resource' 
      });
    }

    const userRole = req.user.role || 'user';
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Authorization failed',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
      });
    }

    next();
  };
};

/**
 * Rate limiting by user
 */
const userRequestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimitByUser = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id || req.ip || 'anonymous';
    const now = Date.now();
    
    const userStats = userRequestCounts.get(userId);
    
    if (!userStats || now > userStats.resetTime) {
      // Reset or initialize
      userRequestCounts.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
    } else if (userStats.count >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.ceil((userStats.resetTime - now) / 1000)} seconds.`
      });
    } else {
      userStats.count++;
      next();
    }
  };
};

/**
 * Logging middleware for authenticated requests
 */
export const logAuthenticatedRequest = (req: Request, res: Response, next: NextFunction) => {
  if (req.user) {
    console.log(`[AUTH] ${new Date().toISOString()} - User: ${req.user.username} (${req.user.id}) - ${req.method} ${req.path}`);
  }
  next();
};

/**
 * API Key validation for public endpoints
 * Protects against unauthorized access while allowing your app to use the endpoints
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Please provide a valid API key in the x-api-key header'
    });
  }
  
  if (apiKey !== API_KEY) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }
  
  next();
};

/**
 * Origin validation middleware
 * Validates that requests come from allowed domains
 */
export const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  // Allow requests without origin/referer for direct API access (Postman, curl, etc.)
  // In production, you might want to remove this and require origin
  if (!origin && !referer && process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Check origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return next();
  }
  
  // Check referer as fallback
  if (referer) {
    const refererUrl = new URL(referer);
    const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
    if (ALLOWED_ORIGINS.includes(refererOrigin)) {
      return next();
    }
  }
  
  return res.status(403).json({
    error: 'Origin not allowed',
    message: 'Requests from this origin are not permitted'
  });
};

/**
 * Combined security middleware for public endpoints
 * Use this for register, waitlist, etc.
 */
export const securePublicEndpoint = [requireApiKey, validateOrigin];

/**
 * Stricter rate limiting for public endpoints (by IP)
 * Prevents abuse from single IP addresses
 */
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

export const strictRateLimitByIP = (maxRequests: number = 10, windowMs: number = 60 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const ipStats = ipRequestCounts.get(clientIP);
    
    if (!ipStats || now > ipStats.resetTime) {
      // Reset or initialize
      ipRequestCounts.set(clientIP, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
    } else if (ipStats.count >= maxRequests) {
      const timeLeft = Math.ceil((ipStats.resetTime - now) / 1000);
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests from this IP. Try again in ${timeLeft} seconds.`,
        retryAfter: timeLeft
      });
    } else {
      ipStats.count++;
      next();
    }
  };
};