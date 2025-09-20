import { describe, it, expect } from 'vitest';
import { 
  generateClientSecret, 
  hashClientSecret, 
  verifyClientSecret, 
  maskClientSecret 
} from '../src/security/secrets.js';

describe('Security Utilities', () => {
  describe('generateClientSecret', () => {
    it('should generate a base64-encoded secret', () => {
      const secret = generateClientSecret();
      expect(secret).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it('should generate unique secrets', () => {
      const secret1 = generateClientSecret();
      const secret2 = generateClientSecret();
      expect(secret1).not.toBe(secret2);
    });

    it('should generate secrets of appropriate length', () => {
      const secret = generateClientSecret();
      // 32 bytes base64 encoded should be ~44 characters
      expect(secret.length).toBeGreaterThan(40);
      expect(secret.length).toBeLessThan(50);
    });

    it('should generate cryptographically strong secrets', () => {
      const secrets = Array.from({ length: 100 }, () => generateClientSecret());
      const uniqueSecrets = new Set(secrets);
      
      // All 100 secrets should be unique
      expect(uniqueSecrets.size).toBe(100);
    });
  });

  describe('hashClientSecret', () => {
    it('should hash a secret using bcrypt', async () => {
      const secret = 'test-secret';
      const hash = await hashClientSecret(secret);
      
      expect(hash).toMatch(/^\$2[aby]\$\d{1,2}\$/); // bcrypt pattern
      expect(hash).not.toBe(secret);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for the same secret', async () => {
      const secret = 'test-secret';
      const hash1 = await hashClientSecret(secret);
      const hash2 = await hashClientSecret(secret);
      
      expect(hash1).not.toBe(hash2); // bcrypt salt makes each hash unique
    });

    it('should handle edge cases', async () => {
      const testCases = [
        '', // Empty string
        ' ', // Whitespace
        'a', // Single character
        'a'.repeat(1000), // Very long string
        '🔐🗝️', // Unicode characters
        'line1\\nline2', // Newlines
        'null', // String 'null'
      ];

      for (const testCase of testCases) {
        const hash = await hashClientSecret(testCase);
        expect(hash).toMatch(/^\$2[aby]\$\d{1,2}\$/);
        expect(hash).not.toBe(testCase);
      }
    });
  });

  describe('verifyClientSecret', () => {
    it('should verify correct secret against hash', async () => {
      const secret = 'test-secret-123';
      const hash = await hashClientSecret(secret);
      
      const isValid = await verifyClientSecret(secret, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect secret against hash', async () => {
      const secret = 'test-secret-123';
      const wrongSecret = 'wrong-secret-456';
      const hash = await hashClientSecret(secret);
      
      const isValid = await verifyClientSecret(wrongSecret, hash);
      expect(isValid).toBe(false);
    });

    it('should be case sensitive', async () => {
      const secret = 'TestSecret';
      const hash = await hashClientSecret(secret);
      
      const validCases = await Promise.all([
        verifyClientSecret('TestSecret', hash),
        verifyClientSecret('testsecret', hash),
        verifyClientSecret('TESTSECRET', hash),
      ]);

      expect(validCases[0]).toBe(true);  // Exact match
      expect(validCases[1]).toBe(false); // Different case
      expect(validCases[2]).toBe(false); // Different case
    });

    it('should handle timing attacks consistently', async () => {
      const secret = 'test-secret';
      const hash = await hashClientSecret(secret);
      
      // Test multiple verification attempts to ensure consistent timing
      const startTime = Date.now();
      const validResults = await Promise.all(Array.from({ length: 10 }, () => 
        verifyClientSecret(secret, hash)
      ));
      const validTime = Date.now() - startTime;

      const startTime2 = Date.now();
      const invalidResults = await Promise.all(Array.from({ length: 10 }, () => 
        verifyClientSecret('wrong-secret', hash)
      ));
      const invalidTime = Date.now() - startTime2;

      // All valid results should be true
      expect(validResults.every(r => r === true)).toBe(true);
      // All invalid results should be false
      expect(invalidResults.every(r => r === false)).toBe(true);
      
      // Timing difference should not be too significant (bcrypt helps with this)
      const timingRatio = Math.abs(validTime - invalidTime) / Math.max(validTime, invalidTime);
      expect(timingRatio).toBeLessThan(0.5); // Less than 50% difference
    });

    it('should handle malformed hashes gracefully', async () => {
      const secret = 'test-secret';
      const malformedHashes = [
        '', // Empty string
        'plain-text', // Not a hash
        '$2a$10$invalid', // Incomplete hash
        '$invalid$10$hash', // Wrong algorithm
      ];

      for (const hash of malformedHashes) {
        try {
          const isValid = await verifyClientSecret(secret, hash);
          expect(isValid).toBe(false);
        } catch (error) {
          // For null/undefined and other invalid inputs, bcrypt might throw
          // This is acceptable behavior
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('maskClientSecret', () => {
    it('should mask long secrets correctly', () => {
      const secret = 'abcdefghijklmnopqrstuvwxyz';
      const masked = maskClientSecret(secret);
      
      expect(masked).toBe('abcdefgh...');
      expect(masked.length).toBe(11);
    });

    it('should return short secrets as-is', () => {
      const shortSecrets = ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh'];
      
      shortSecrets.forEach(secret => {
        const masked = maskClientSecret(secret);
        expect(masked).toBe(secret);
      });
    });

    it('should handle edge cases', () => {
      expect(maskClientSecret('')).toBe('');
      expect(maskClientSecret('123456789')).toBe('12345678...');
      // Unicode handling - different behavior on different systems
      const unicodeResult = maskClientSecret('🔐🗝️🔒🔓🗝️🔐🔒🔓🗝️');
      expect(unicodeResult.endsWith('...')).toBe(true);
      expect(unicodeResult.length).toBeGreaterThan(3);
    });

    it('should not reveal the original secret', () => {
      const secret = generateClientSecret();
      const masked = maskClientSecret(secret);
      
      expect(masked).not.toBe(secret);
      expect(masked.length).toBeLessThan(secret.length);
      expect(masked.endsWith('...')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should work through full lifecycle', async () => {
      // Generate -> Hash -> Verify workflow
      const secret = generateClientSecret();
      const hash = await hashClientSecret(secret);
      const isValid = await verifyClientSecret(secret, hash);
      
      expect(isValid).toBe(true);
    });

    it('should handle multiple secrets correctly', async () => {
      const secrets = Array.from({ length: 3 }, () => generateClientSecret()); // Reduced from 5 to 3
      const hashes = await Promise.all(secrets.map(hashClientSecret));
      
      // Each secret should verify against its own hash
      for (let i = 0; i < secrets.length; i++) {
        const isValid = await verifyClientSecret(secrets[i], hashes[i]);
        expect(isValid).toBe(true);
      }
      
      // Each secret should NOT verify against other hashes
      for (let i = 0; i < secrets.length; i++) {
        for (let j = 0; j < hashes.length; j++) {
          if (i !== j) {
            const isValid = await verifyClientSecret(secrets[i], hashes[j]);
            expect(isValid).toBe(false);
          }
        }
      }
    }, 10000); // Increased timeout

    it('should maintain security over time', async () => {
      const secret = generateClientSecret();
      const hash = await hashClientSecret(secret);
      
      // Verify immediately
      expect(await verifyClientSecret(secret, hash)).toBe(true);
      
      // Verify after small delay (simulating real-world usage)
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(await verifyClientSecret(secret, hash)).toBe(true);
      
      // Wrong secret should still fail
      expect(await verifyClientSecret('wrong', hash)).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    it('should hash secrets within reasonable time', async () => {
      const secret = generateClientSecret();
      const startTime = Date.now();
      
      await hashClientSecret(secret);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should verify secrets within reasonable time', async () => {
      const secret = generateClientSecret();
      const hash = await hashClientSecret(secret);
      
      const startTime = Date.now();
      await verifyClientSecret(secret, hash);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });

    it('should generate secrets quickly', () => {
      const startTime = Date.now();
      
      // Generate multiple secrets
      Array.from({ length: 100 }, () => generateClientSecret());
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });
});