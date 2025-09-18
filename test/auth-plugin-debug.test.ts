import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import dotenv from 'dotenv';

// Load test environment configuration
dotenv.config({ path: '.env.test' });

// Test to verify auth plugin is working
describe('Auth Plugin Debug', () => {
  let app: any;

  beforeEach(async () => {
    app = buildApp();
  });

  it('should call authenticate function', async () => {
    console.log('🔹 Testing /me endpoint without token...');
    
    // Call /me without any authentication - this should trigger the authenticate function
    const res = await app.inject({
      method: 'GET',
      url: '/me'
    });

    console.log('🔹 Response status:', res.statusCode);
    console.log('🔹 Response body:', res.payload);

    // Should return 401 if authentication is working
    expect(res.statusCode).toBe(401);
  });
});