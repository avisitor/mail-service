import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBatchConfig, globalRateTracker } from '../src/config/batch.js';

describe('Batch Configuration', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      MAIL_BATCH_SIZE: process.env.MAIL_BATCH_SIZE,
      MAIL_INTER_BATCH_DELAY_MS: process.env.MAIL_INTER_BATCH_DELAY_MS,
      MAIL_MAX_EMAILS_PER_HOUR: process.env.MAIL_MAX_EMAILS_PER_HOUR,
      MAIL_MAX_EMAILS_PER_DAY: process.env.MAIL_MAX_EMAILS_PER_DAY
    };
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('should use default configuration when no env vars are set', () => {
    // Clear environment variables
    delete process.env.MAIL_BATCH_SIZE;
    delete process.env.MAIL_INTER_BATCH_DELAY_MS;
    delete process.env.MAIL_MAX_EMAILS_PER_HOUR;
    delete process.env.MAIL_MAX_EMAILS_PER_DAY;

    const config = getBatchConfig();
    
    expect(config.batchSize).toBe(10);
    expect(config.interBatchDelayMs).toBe(0);
    expect(config.maxEmailsPerHour).toBeUndefined();
    expect(config.maxEmailsPerDay).toBeUndefined();
  });

  it('should use environment variable configuration', () => {
    process.env.MAIL_BATCH_SIZE = '5';
    process.env.MAIL_INTER_BATCH_DELAY_MS = '2000';
    process.env.MAIL_MAX_EMAILS_PER_HOUR = '100';
    process.env.MAIL_MAX_EMAILS_PER_DAY = '1000';

    const config = getBatchConfig();
    
    expect(config.batchSize).toBe(5);
    expect(config.interBatchDelayMs).toBe(2000);
    expect(config.maxEmailsPerHour).toBe(100);
    expect(config.maxEmailsPerDay).toBe(1000);
  });

  it('should handle anti-spam batching configuration', () => {
    // Set up for anti-spam batching: small batches with delays
    process.env.MAIL_BATCH_SIZE = '50';
    process.env.MAIL_INTER_BATCH_DELAY_MS = '60000'; // 1 minute delay
    process.env.MAIL_MAX_EMAILS_PER_HOUR = '500';

    const config = getBatchConfig();
    
    expect(config.batchSize).toBe(50);
    expect(config.interBatchDelayMs).toBe(60000);
    expect(config.maxEmailsPerHour).toBe(500);
  });
});

describe('Rate Tracker', () => {
  beforeEach(() => {
    // Reset rate tracker state (this is a simple way for testing)
    // In production, you might want a more sophisticated reset mechanism
    (globalRateTracker as any).hourlyCounter = { count: 0, resetTime: 0 };
    (globalRateTracker as any).dailyCounter = { count: 0, resetTime: 0 };
  });

  it('should allow emails within hourly limit', () => {
    expect(globalRateTracker.checkHourlyLimit(100)).toBe(true);
    
    // Increment counter 50 times
    for (let i = 0; i < 50; i++) {
      globalRateTracker.incrementCounters();
    }
    
    expect(globalRateTracker.checkHourlyLimit(100)).toBe(true);
    expect(globalRateTracker.getRemainingHourly(100)).toBe(50);
  });

  it('should block emails when hourly limit is reached', () => {
    // Set counter to limit
    for (let i = 0; i < 100; i++) {
      globalRateTracker.incrementCounters();
    }
    
    expect(globalRateTracker.checkHourlyLimit(100)).toBe(false);
    expect(globalRateTracker.getRemainingHourly(100)).toBe(0);
  });

  it('should allow emails within daily limit', () => {
    expect(globalRateTracker.checkDailyLimit(1000)).toBe(true);
    
    // Increment counter 500 times
    for (let i = 0; i < 500; i++) {
      globalRateTracker.incrementCounters();
    }
    
    expect(globalRateTracker.checkDailyLimit(1000)).toBe(true);
    expect(globalRateTracker.getRemainingDaily(1000)).toBe(500);
  });

  it('should block emails when daily limit is reached', () => {
    // Set counter to limit
    for (let i = 0; i < 1000; i++) {
      globalRateTracker.incrementCounters();
    }
    
    expect(globalRateTracker.checkDailyLimit(1000)).toBe(false);
    expect(globalRateTracker.getRemainingDaily(1000)).toBe(0);
  });

  it('should not limit when no limits are set', () => {
    expect(globalRateTracker.checkHourlyLimit()).toBe(true);
    expect(globalRateTracker.checkDailyLimit()).toBe(true);
    expect(globalRateTracker.getRemainingHourly()).toBe(Infinity);
    expect(globalRateTracker.getRemainingDaily()).toBe(Infinity);
  });
});