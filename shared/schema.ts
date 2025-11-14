import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default('user'), // 'user', 'admin', 'moderator'
  emailVerified: text("email_verified").default(sql`NULL`), // timestamp when email was verified
  emailVerificationToken: text("email_verification_token").default(sql`NULL`), // token for email verification
  emailVerificationExpires: text("email_verification_expires").default(sql`NULL`), // when token expires
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const waitlist = pgTable("waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  interests: text("interests"),
  emailVerified: text("email_verified").default(sql`NULL`), // timestamp when email was verified
  emailVerificationToken: text("email_verification_token").default(sql`NULL`), // token for email verification
  emailVerificationExpires: text("email_verification_expires").default(sql`NULL`), // when token expires
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
}).extend({
  username: z.string()
    .min(1, "Username is required")
    .refine((value) => {
      // Enhanced email validation that supports international domain names (IDN)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    }, "Must be a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.string().optional().default('user'),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).pick({
  name: true,
  email: true,
  interests: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  email: z.string()
    .min(1, "Email is required")
    .refine((value) => {
      // Enhanced email validation that supports international domain names (IDN)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    }, "Must be a valid email"),
  interests: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type WaitlistEntry = typeof waitlist.$inferSelect;
