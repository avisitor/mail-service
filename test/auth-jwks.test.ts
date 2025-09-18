import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jwks-rsa
const mockGetSigningKey = vi.fn();
const mockJwksClient = {
  getSigningKey: mockGetSigningKey
};

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => mockJwksClient)
}));

// Import after mocking
const { getSigningKey } = await import('../src/auth/jwks.js');

describe('JWKS Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSigningKey', () => {
    it('should return signing key for valid kid', async () => {
      const mockKey = {
        getPublicKey: () => 'mock-public-key'
      };
      
      mockGetSigningKey.mockResolvedValue(mockKey);

      const result = await getSigningKey('test-kid');
      
      expect(result).toBe('mock-public-key');
      expect(mockGetSigningKey).toHaveBeenCalledWith('test-kid');
    });

    it('should handle JWKS client errors', async () => {
      const error = new Error('JWKS retrieval failed');
      mockGetSigningKey.mockRejectedValue(error);

      await expect(getSigningKey('invalid-kid')).rejects.toThrow('JWKS retrieval failed');
      expect(mockGetSigningKey).toHaveBeenCalledWith('invalid-kid');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockGetSigningKey.mockRejectedValue(networkError);

      await expect(getSigningKey('test-kid')).rejects.toThrow('Network error');
    });

    it('should handle missing key errors', async () => {
      const missingKeyError = new Error('Unable to find a signing key that matches');
      mockGetSigningKey.mockRejectedValue(missingKeyError);

      await expect(getSigningKey('missing-kid')).rejects.toThrow('Unable to find a signing key that matches');
    });
  });
});