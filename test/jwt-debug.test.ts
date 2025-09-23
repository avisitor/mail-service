import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import jwt from 'jsonwebtoken';
import { existsSync, readFileSync } from 'fs';

// Simple test to debug JWT token passing with RS256
describe('JWT Debug', () => {
  let app: any;

  beforeEach(async () => {
    app = buildApp();
  });

  it('should pass RS256 JWT token correctly', async () => {
    // Create RS256 token with real private key
    const privateKey = readFileSync('keys/private-6ca1a309a735fb83.pem', 'utf8');
    
    const payload = {
      sub: 'test@example.com',
      iss: 'https://idp.worldspot.org', // Production issuer
      aud: 'mail-service',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        kid: '6ca1a309a735fb83'
      }
    });

    console.log('🔹 Generated RS256 token (first 50 chars):', token.substring(0, 50) + '...');

    // Call the debug endpoint to see what the auth system receives
    const res = await app.inject({
      method: 'GET',
      url: '/debug/auth',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('🔹 Debug response status:', res.statusCode);
    console.log('🔹 Debug response body:', res.payload);

    // Should not be a server error
    expect(res.statusCode).toBeLessThan(500);
  });
});