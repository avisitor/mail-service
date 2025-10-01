import { getPrisma } from '../../db/prisma.js';
import { sendEmail } from '../../providers/smtp.js';
import { processEmailTemplate, RecipientContext } from '../../utils/templates.js';
import { getBatchConfig, globalRateTracker, sleep } from '../../config/batch.js';
import { nanoid } from 'nanoid';

export interface WorkerResult {
  jobsProcessed: number;
  jobsSent: number;
  jobsFailed: number;
  jobsRateLimited: number;
  errors: string[];
}

/**
 * Main worker function that processes pending and scheduled email jobs with configurable batching
 * @param limitJobs Maximum number of jobs to process in this tick (defaults to config or 50)
 */
export async function workerTick(limitJobs?: number): Promise<WorkerResult> {
  const batchConfig = getBatchConfig();
  const effectiveLimitJobs = limitJobs || Math.min(50, batchConfig.batchSize * 5); // Process up to 5 batches worth
  const prisma = getPrisma();
  const result: WorkerResult = {
    jobsProcessed: 0,
    jobsSent: 0,
    jobsFailed: 0,
    jobsRateLimited: 0,
    errors: []
  };

  try {
    // Find all jobs ready to be processed
    const jobs = await prisma.emailJob.findMany({
      where: {
        status: { in: ['pending', 'failed'] },
        attemptCount: { lt: 3 }, // maxAttempts
        OR: [
          { scheduledAt: null }, // Send now jobs
          { scheduledAt: { lte: new Date() } } // Scheduled jobs whose time has come
        ]
      },
      orderBy: [
        { scheduledAt: 'asc' }, // Send immediate jobs first, then by schedule
        { createdAt: 'asc' }
      ]
    });

    if (jobs.length === 0) {
      return result;
    }

    // Determine how many jobs we can process this tick
    const remainingHourly = globalRateTracker.getRemainingHourly(batchConfig.maxEmailsPerHour);
    const remainingDaily = globalRateTracker.getRemainingDaily(batchConfig.maxEmailsPerDay);
    const maxJobsToProcess = Math.min(
      effectiveLimitJobs,
      remainingHourly,
      remainingDaily
    );

    console.log(`[Worker] Found ${jobs.length} jobs, will process up to ${maxJobsToProcess} due to rate limits.`);

    // Process jobs in batches with configurable delays
    for (let i = 0; i < jobs.length; i += batchConfig.batchSize) {
      const batch = jobs.slice(i, i + batchConfig.batchSize);
      // Only process jobs if we haven't hit the rate limit
      if (result.jobsProcessed >= maxJobsToProcess) {
        // Mark remaining jobs as rate limited
        result.jobsRateLimited += batch.length;
        continue;
      }

      // Check rate limits before each batch
      const hourlyAllowed = globalRateTracker.checkHourlyLimit(batchConfig.maxEmailsPerHour);
      const dailyAllowed = globalRateTracker.checkDailyLimit(batchConfig.maxEmailsPerDay);
      if (!hourlyAllowed || !dailyAllowed) {
        result.jobsRateLimited += batch.length;
        continue;
      }

      // Only process up to the allowed jobs in this batch
      const jobsToProcess = batch.slice(0, maxJobsToProcess - result.jobsProcessed);
      const batchPromises = jobsToProcess.map(job => processJob(job));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((promiseResult, index) => {
        const job = jobsToProcess[index];
        result.jobsProcessed++;
        if (promiseResult.status === 'fulfilled') {
          result.jobsSent++;
          globalRateTracker.incrementCounters();
        } else {
          result.jobsFailed++;
          result.errors.push(`Job ${job.jobId}: ${promiseResult.reason?.message || 'Unknown error'}`);
        }
      });

      // Mark any jobs in the batch that weren't processed as rate limited
      if (batch.length > jobsToProcess.length) {
        result.jobsRateLimited += batch.length - jobsToProcess.length;
      }

      // Inter-batch delay (for anti-spam batching)
      if (batchConfig.interBatchDelayMs > 0 && i + batchConfig.batchSize < jobs.length) {
        await sleep(batchConfig.interBatchDelayMs);
      }
    }

    return result;

    // Process jobs in batches with configurable delays
    for (let i = 0; i < jobs.length; i += batchConfig.batchSize) {
      const batch = jobs.slice(i, i + batchConfig.batchSize);
      
      // Check rate limits before each batch
      const hourlyAllowed = globalRateTracker.checkHourlyLimit(batchConfig.maxEmailsPerHour);
      const dailyAllowed = globalRateTracker.checkDailyLimit(batchConfig.maxEmailsPerDay);
      console.log(`[Worker] Rate limit check: hourly=${hourlyAllowed}, daily=${dailyAllowed}, maxPerHour=${batchConfig.maxEmailsPerHour}, processed=${i} jobs`);
      
      if (!hourlyAllowed || !dailyAllowed) {
        console.log(`[Worker] Rate limit reached after processing ${i} jobs`);
        result.jobsRateLimited = jobs.length - i;
        break;
      }
      
      console.log(`[Worker] Processing batch ${Math.floor(i / batchConfig.batchSize) + 1} with ${batch.length} jobs`);
      
      // Process batch in parallel
      const batchPromises = batch.map(job => processJob(job));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Update results and rate counters
      batchResults.forEach((promiseResult, index) => {
        const job = batch[index];
        result.jobsProcessed++;
        
        if (promiseResult.status === 'fulfilled') {
          result.jobsSent++;
          globalRateTracker.incrementCounters(); // Track successful sends for rate limiting
        } else {
          result.jobsFailed++;
          console.error(`[Worker] Job ${job.jobId} failed:`, promiseResult.reason?.message || 'Unknown error');
          console.error(`[Worker] Job ${job.jobId} full error:`, promiseResult.reason);
          result.errors.push(`Job ${job.jobId}: ${promiseResult.reason?.message || 'Unknown error'}`);
        }
      });

      // Inter-batch delay (for anti-spam batching)
      if (batchConfig.interBatchDelayMs > 0 && i + batchConfig.batchSize < jobs.length) {
        console.log(`[Worker] Waiting ${batchConfig.interBatchDelayMs}ms before next batch...`);
        await sleep(batchConfig.interBatchDelayMs);
      }
    }

    console.log(`[Worker] Completed tick: ${result.jobsProcessed} processed, ${result.jobsSent} sent, ${result.jobsFailed} failed, ${result.jobsRateLimited} rate limited`);
    return result;
  } catch (error: any) {
    result.errors.push(`Worker tick failed: ${error.message}`);
    return result;
  }
}

/**
 * Process a single email job
 */
async function processJob(job: any): Promise<void> {
  const prisma = getPrisma();
  const { nanoid } = await import('nanoid');
  
  try {
    // Mark job as processing to prevent duplicate processing
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { 
        status: 'processing',
        startedAt: new Date(),
        attemptCount: { increment: 1 }
      }
    });

    // Parse recipients (now just email and name, no template context needed)
    let recipients: Array<{ email: string; name?: string }> = [];
    try {
      recipients = JSON.parse(job.recipients || '[]');
    } catch {
      // Handle legacy format or simple email strings
      if (job.recipients) {
        recipients = [{ email: job.recipients }];
      }
    }

    if (recipients.length === 0) {
      throw new Error('No recipients found');
    }

    // For multiple recipients, we'll send to the first one for now
    // TODO: In the future, we might want to create separate jobs for each recipient
    const recipient = recipients[0];
    
    // Subject and message are already processed with template variables
    const subject = job.subject || 'No Subject';
    const html = job.message || undefined;
    
    // Check if this is a test email by looking for TEST_MODE: prefix in host field
    const isTestEmail = job.host?.startsWith('TEST_MODE:') || false;
    
    console.log(`[Worker] Sending email to ${recipient.email}:`, {
      subject: subject,
      hasHtml: !!html,
      isTestEmail: isTestEmail
    });
    
    // Send the email and capture delivery result
    const deliveryResult = await sendEmail({
      to: recipient.email,
      subject: subject,
      html: html,
      appId: job.appId,
      testEmail: isTestEmail // Use detected test mode
    });

    console.log(`[Worker] Email delivery result for job ${job.jobId}:`, {
      messageId: deliveryResult.messageId,
      status: deliveryResult.status,
      accepted: deliveryResult.accepted,
      rejected: deliveryResult.rejected,
      response: deliveryResult.response
    });

    // Check if email was accepted or rejected
    if (deliveryResult.rejected && deliveryResult.rejected.length > 0) {
      throw new Error(`Email rejected by SMTP server: ${deliveryResult.response}`);
    }

    // Mark job as completed with delivery details
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        lastError: null
      }
    });

    // Create maillog entry for the sent email with delivery details
    // Handle potential messageId duplicates from MailHog during testing
    let messageId = deliveryResult.messageId || `msg${nanoid(12)}`;
    try {
      await prisma.maillog.create({
        data: {
          messageId: messageId,
          appId: job.appId,
          subject: job.subject,
          senderName: job.senderName,
          senderEmail: job.senderEmail,
          host: job.host,
          username: job.username,
          recipients: JSON.stringify([recipient]),
          message: job.message
        }
      });
    } catch (maillogError: any) {
      // If messageId conflict, generate a unique one and retry
      if (maillogError.code === 'P2002' && maillogError.meta?.target === 'messageId') {
        console.log(`[Worker] MessageId conflict for ${messageId}, generating unique ID`);
        messageId = `${messageId}-${nanoid(6)}`;
        await prisma.maillog.create({
          data: {
            messageId: messageId,
            appId: job.appId,
            subject: job.subject,
            senderName: job.senderName,
            senderEmail: job.senderEmail,
            host: job.host,
            username: job.username,
            recipients: JSON.stringify([recipient]),
            message: job.message
          }
        });
      } else {
        throw maillogError; // Re-throw if it's a different error
      }
    }

  } catch (error: any) {
    // Mark as failed
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        failedAt: new Date(),
        lastError: error.message
      }
    }).catch(() => {
      // If we can't even update the error status, just log it
      console.error(`Failed to update job ${job.jobId} status:`, error);
    });
    
    throw error;
  }
}

/**
 * Create email jobs for batch processing
 */
export async function createEmailJobs(params: {
  appId: string;
  groupId: string;
  subject: string;
  html?: string;
  recipients: Array<RecipientContext>; // Support context data for template variables
  scheduledAt?: Date;
  senderName?: string;
  senderEmail?: string;
  host?: string;
  username?: string;
  testEmail?: boolean; // Add testEmail flag
}): Promise<{ jobIds: string[], groupId: string }> {
  const prisma = getPrisma();
  const { nanoid } = await import('nanoid');
  
  console.log('[createEmailJobs] Creating jobs:', {
    groupId: params.groupId,
    appId: params.appId,
    subject: params.subject,
    recipientCount: params.recipients.length,
    recipients: params.recipients,
    scheduledAt: params.scheduledAt
  });
  
  const jobs = params.recipients.map(recipient => {
    // Process template substitution immediately during job creation
    const { subject: processedSubject, html: processedHtml } = processEmailTemplate(
      params.subject, 
      params.html, 
      recipient
    );
    
    return {
      jobId: 'job' + nanoid(12),
      groupId: params.groupId,
      appId: params.appId,
      status: params.scheduledAt ? 'pending' : 'pending', // All jobs start as pending
      scheduledAt: params.scheduledAt,
      subject: processedSubject, // Store processed subject
      senderName: params.senderName,
      senderEmail: params.senderEmail,
      host: params.testEmail ? 'TEST_MODE:' + (params.host || 'localhost') : params.host, // Prefix with TEST_MODE: if testEmail
      username: params.username,
      recipients: JSON.stringify([{ email: recipient.email, name: recipient.name }]), // Store only email and name
      message: processedHtml, // Store processed HTML
      createdAt: new Date()
    };
  });

  const result = await prisma.emailJob.createMany({
    data: jobs
  });
  
  console.log('[createEmailJobs] Created', result.count, 'jobs with IDs:', jobs.map(j => j.jobId));

  return {
    jobIds: jobs.map(job => job.jobId),
    groupId: params.groupId
  };
}