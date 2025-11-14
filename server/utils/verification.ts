import crypto from 'crypto';

/**
 * Generate a secure random token for email verification
 * @param length The length of the token in bytes (default: 32)
 * @returns A random hex string
 */
export function generateVerificationToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create a verification token expiration date (24 hours from now)
 * @returns Date object set to 24 hours in the future
 */
export function createVerificationExpiry(): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 24); // 24 hours from now
  return expiry;
}

/**
 * Check if a verification token has expired
 * @param expiryDate The expiration date to check
 * @returns true if the token has expired, false otherwise
 */
export function isVerificationExpired(expiryDate: Date): boolean {
  return new Date() > expiryDate;
}

/**
 * Generate a secure hash for storing verification tokens
 * @param token The plain text token
 * @returns A hashed version of the token
 */
export function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a token against its hash
 * @param token The plain text token
 * @param hash The stored hash
 * @returns true if the token matches the hash, false otherwise
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashVerificationToken(token);
  return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
}