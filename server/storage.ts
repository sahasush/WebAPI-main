import dotenv from "dotenv";
import { type User, type InsertUser, users, type InsertWaitlist, type WaitlistEntry, waitlist } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Load environment variables immediately
dotenv.config();

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createWaitlistEntry(entry: InsertWaitlist): Promise<WaitlistEntry>;
  getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined>;
  
  // Email verification methods
  updateWaitlistVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void>;
  updateUserVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void>;
  getWaitlistEntryByVerificationToken(token: string): Promise<WaitlistEntry | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  
  // New admin/auth methods
  getAllUsers(): Promise<User[]>;
  getAllWaitlistEntries(): Promise<WaitlistEntry[]>;
  updateUser(userId: string, updates: Partial<User>): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private waitlistEntries: Map<string, WaitlistEntry>;

  constructor() {
    this.users = new Map();
    this.waitlistEntries = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createWaitlistEntry(entry: InsertWaitlist): Promise<WaitlistEntry> {
    const waitlistEntry: WaitlistEntry = {
      id: Math.random().toString(36).substr(2, 9),
      email: entry.email,
      name: entry.name,
      interests: entry.interests || null,
      createdAt: new Date().toISOString(),
      emailVerified: null,
      emailVerificationToken: null,
      emailVerificationExpires: null
    };
    this.waitlistEntries.set(waitlistEntry.email, waitlistEntry);
    return waitlistEntry;
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined> {
    return this.waitlistEntries.get(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      id: randomUUID(),
      username: user.username,
      password: user.password,
      role: user.role || 'user',
      emailVerified: null,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async updateWaitlistVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    const entry = this.waitlistEntries.get(email);
    if (entry) {
      entry.emailVerified = verified ? new Date().toISOString() : null;
      entry.emailVerificationToken = token || null;
      entry.emailVerificationExpires = expires ? expires.toISOString() : null;
    }
  }

  async updateUserVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    // Find user by username (which is email in our case)
    const user = Array.from(this.users.values()).find(u => u.username === email);
    if (user) {
      user.emailVerified = verified ? new Date().toISOString() : null;
      user.emailVerificationToken = token || null;
      user.emailVerificationExpires = expires ? expires.toISOString() : null;
    }
  }

  async getWaitlistEntryByVerificationToken(token: string): Promise<WaitlistEntry | undefined> {
    return Array.from(this.waitlistEntries.values()).find(
      entry => entry.emailVerificationToken === token
    );
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      user => user.emailVerificationToken === token
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getAllWaitlistEntries(): Promise<WaitlistEntry[]> {
    return Array.from(this.waitlistEntries.values());
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      Object.assign(user, updates, { updatedAt: new Date().toISOString() });
    }
  }
}

export class DbStorage implements IStorage {
  constructor(private db: any) {} // Accept drizzle instances

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Provide an id to avoid relying on DB extensions for UUID generation
    const withId = { ...(insertUser as any), id: randomUUID() } as any;
    const rows = await this.db.insert(users).values(withId).returning();
    // Return inserted row
    return rows[0];
  }

  async createWaitlistEntry(entry: InsertWaitlist): Promise<WaitlistEntry> {
    const withId = { 
      ...entry, 
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    const rows = await this.db.insert(waitlist).values(withId).returning();
    return rows[0];
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined> {
    const rows = await this.db.select().from(waitlist).where(eq(waitlist.email, email)).limit(1);
    return rows[0];
  }

  async updateWaitlistVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    await this.db
      .update(waitlist)
      .set({
        emailVerified: verified ? new Date().toISOString() : null,
        emailVerificationToken: token || null,
        emailVerificationExpires: expires ? expires.toISOString() : null
      })
      .where(eq(waitlist.email, email));
  }

  async updateUserVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    await this.db
      .update(users)
      .set({
        emailVerified: verified ? new Date().toISOString() : null,
        emailVerificationToken: token || null,
        emailVerificationExpires: expires ? expires.toISOString() : null
      })
      .where(eq(users.username, email)); // Assuming username is email
  }

  async getWaitlistEntryByVerificationToken(token: string): Promise<WaitlistEntry | undefined> {
    const rows = await this.db
      .select()
      .from(waitlist)
      .where(eq(waitlist.emailVerificationToken, token))
      .limit(1);
    return rows[0];
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);
    return rows[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }

  async getAllWaitlistEntries(): Promise<WaitlistEntry[]> {
    return await this.db.select().from(waitlist);
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));
  }
}

let storageImpl: IStorage;

async function initializeStorage(): Promise<IStorage> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[storage] Using in-memory storage (no DATABASE_URL)");
    return new MemStorage();
  }

  console.log(`[storage] Initializing PostgreSQL connection...`);
  console.log(`[storage] Database URL: ${url.substring(0, 30)}...`);

  // Use node-postgres for all PostgreSQL connections
  // Check if SSL should be disabled based on URL parameters
  const sslMode = url.includes('sslmode=disable') ? false : { rejectUnauthorized: false };
  
  const pool = new Pool({
    connectionString: url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: sslMode
  });

  // Test the connection
  try {
    const client = await pool.connect();
    console.log('[storage] ✅ PostgreSQL connection successful');
    client.release();
    
    const db = drizzle(pool);
    console.log('[storage] Using PostgreSQL via node-postgres');
    return new DbStorage(db);
  } catch (testError) {
    console.warn('[storage] ❌ PostgreSQL connection failed:', testError);
    throw testError;
  }
}

// Storage proxy that handles async initialization
class StorageProxy implements IStorage {
  private storageImpl: IStorage = new MemStorage();
  private initialized = false;

  constructor() {
    this.initializeAsync();
  }

  private async initializeAsync() {
    try {
      this.storageImpl = await initializeStorage();
      this.initialized = true;
    } catch (err) {
      this.storageImpl = new MemStorage();
      this.initialized = true;
      console.warn("[storage] Failed to initialize database, using memory storage:", err);
    }
  }

  private async ensureInitialized() {
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureInitialized();
    return this.storageImpl.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureInitialized();
    return this.storageImpl.getUserByUsername(username);
  }

  async createUser(user: InsertUser): Promise<User> {
    await this.ensureInitialized();
    return this.storageImpl.createUser(user);
  }

  async createWaitlistEntry(entry: InsertWaitlist): Promise<WaitlistEntry> {
    await this.ensureInitialized();
    return this.storageImpl.createWaitlistEntry(entry);
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined> {
    await this.ensureInitialized();
    return this.storageImpl.getWaitlistEntryByEmail(email);
  }

  async updateWaitlistVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    await this.ensureInitialized();
    return this.storageImpl.updateWaitlistVerification(email, verified, token, expires);
  }

  async updateUserVerification(email: string, verified: boolean, token?: string | null, expires?: Date | null): Promise<void> {
    await this.ensureInitialized();
    return this.storageImpl.updateUserVerification(email, verified, token, expires);
  }

  async getWaitlistEntryByVerificationToken(token: string): Promise<WaitlistEntry | undefined> {
    await this.ensureInitialized();
    return this.storageImpl.getWaitlistEntryByVerificationToken(token);
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    await this.ensureInitialized();
    return this.storageImpl.getUserByVerificationToken(token);
  }

  async getAllUsers(): Promise<User[]> {
    await this.ensureInitialized();
    return this.storageImpl.getAllUsers();
  }

  async getAllWaitlistEntries(): Promise<WaitlistEntry[]> {
    await this.ensureInitialized();
    return this.storageImpl.getAllWaitlistEntries();
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    await this.ensureInitialized();
    return this.storageImpl.updateUser(userId, updates);
  }
}

export const storage = new StorageProxy();
