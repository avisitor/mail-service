import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Security utilities for managing client secrets
 */

const SALT_ROUNDS = 12;

/**
 * Generate a secure random client secret
 */
export function generateClientSecret(): string {
  // Generate a 32-byte random string and encode as base64
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Hash a client secret for storage
 */
export async function hashClientSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

/**
 * Verify a client secret against a stored hash
 */
export async function verifyClientSecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/**
 * Generate a display-friendly version of a secret (first 8 chars + ...)
 */
export function maskClientSecret(secret: string): string {
  if (secret.length <= 8) return secret;
  return secret.substring(0, 8) + '...';
}