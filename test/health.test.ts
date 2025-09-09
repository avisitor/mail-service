import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health', () => {
  it('returns ok for /healthz', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ status: 'ok' });
  });
});
