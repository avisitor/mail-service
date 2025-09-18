import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { flags } from '../src/config.js';
import dotenv from 'dotenv';

// Load test environment configuration
dotenv.config({ path: '.env.test' });

// Test to check auth configuration
describe('Config Debug', () => {
  it('should show auth configuration', () => {
    console.log('🔹 Auth flags:', JSON.stringify(flags, null, 2));
    console.log('🔹 DISABLE_AUTH env var:', process.env.DISABLE_AUTH);
    console.log('🔹 NODE_ENV:', process.env.NODE_ENV);
  });
});