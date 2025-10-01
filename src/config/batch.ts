/**
 * Global batch processing settings
 */
export interface BatchConfig {
  batchSize: number;           // Number of emails to process simultaneously
  interBatchDelayMs: number;   // Milliseconds to wait between batches
  maxEmailsPerHour?: number;   // Maximum emails per hour (rate limiting)
  maxEmailsPerDay?: number;    // Maximum emails per day (daily quota)
}

/**
 * Get global batch configuration from environment variables or defaults
 */
export function getBatchConfig(): BatchConfig {
  return {
    batchSize: parseInt(process.env.MAIL_BATCH_SIZE || '10'),
    interBatchDelayMs: parseInt(process.env.MAIL_INTER_BATCH_DELAY_MS || '0'),
    maxEmailsPerHour: process.env.MAIL_MAX_EMAILS_PER_HOUR ? parseInt(process.env.MAIL_MAX_EMAILS_PER_HOUR) : undefined,
    maxEmailsPerDay: process.env.MAIL_MAX_EMAILS_PER_DAY ? parseInt(process.env.MAIL_MAX_EMAILS_PER_DAY) : undefined
  };
}

/**
 * Simple in-memory rate tracking for global limits
 */
class RateTracker {
  private hourlyCounter = { count: 0, resetTime: 0 };
  private dailyCounter = { count: 0, resetTime: 0 };

  checkHourlyLimit(maxPerHour?: number): boolean {
    if (!maxPerHour) return true;

    const now = Date.now();
    if (now > this.hourlyCounter.resetTime) {
      this.hourlyCounter = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    
    return this.hourlyCounter.count < maxPerHour;
  }

  checkDailyLimit(maxPerDay?: number): boolean {
    if (!maxPerDay) return true;

    const now = Date.now();
    if (now > this.dailyCounter.resetTime) {
      this.dailyCounter = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }
    
    return this.dailyCounter.count < maxPerDay;
  }

  incrementCounters(): void {
    const now = Date.now();
    
    // Reset hourly counter if needed
    if (now > this.hourlyCounter.resetTime) {
      this.hourlyCounter = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    this.hourlyCounter.count++;
    
    // Reset daily counter if needed
    if (now > this.dailyCounter.resetTime) {
      this.dailyCounter = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }
    this.dailyCounter.count++;
  }

  getRemainingHourly(maxPerHour?: number): number {
    if (!maxPerHour) return Infinity;

    const now = Date.now();
    if (now > this.hourlyCounter.resetTime) {
      return maxPerHour;
    }
    return Math.max(0, maxPerHour - this.hourlyCounter.count);
  }

  getRemainingDaily(maxPerDay?: number): number {
    if (!maxPerDay) return Infinity;

    const now = Date.now();
    if (now > this.dailyCounter.resetTime) {
      return maxPerDay;
    }
    return Math.max(0, maxPerDay - this.dailyCounter.count);
  }

  /**
   * Reset counters for testing purposes
   */
  reset(): void {
    this.hourlyCounter = { count: 0, resetTime: 0 };
    this.dailyCounter = { count: 0, resetTime: 0 };
  }
}

export const globalRateTracker = new RateTracker();

/**
 * Sleep utility for inter-batch delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}