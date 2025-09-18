import { getPrisma } from '../../db/prisma.js';
import { sendEmail } from '../../providers/smtp.js';
import { processEmailTemplate, RecipientContext } from '../../utils/templates.js';

export interface WorkerResult {
  jobsProcessed: number;
  jobsSent: number;
  jobsFailed: number;
  errors: string[];
}

/**
 * Main worker function that processes pending and scheduled email jobs
 * @param limitJobs Maximum number of jobs to process in this tick
 * @param batchSize Maximum number of emails to send in parallel
 */
export async function workerTick(limitJobs = 50, batchSize = 10): Promise<WorkerResult> {
  const prisma = getPrisma();
  const result: WorkerResult = {
    jobsProcessed: 0,
    jobsSent: 0,
    jobsFailed: 0,
    errors: []
  };

  try {
    // Find jobs ready to be processed
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
      ],
      take: limitJobs
    });

    if (jobs.length === 0) {
      return result;
    }

    // Process jobs in batches to avoid overwhelming SMTP servers
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(job => processJob(job));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Update results
      batchResults.forEach((promiseResult, index) => {
        const job = batch[index];
        result.jobsProcessed++;
        
        if (promiseResult.status === 'fulfilled') {
          result.jobsSent++;
        } else {
          result.jobsFailed++;
          result.errors.push(`Job ${job.jobId}: ${promiseResult.reason?.message || 'Unknown error'}`);
        }
      });
    }

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
    
    console.log(`[Worker] Sending email to ${recipient.email}:`, {
      subject: subject,
      hasHtml: !!html
    });
    
    // Send the email and capture delivery result
    const deliveryResult = await sendEmail({
      to: recipient.email,
      subject: subject,
      html: html,
      appId: job.appId,
      testEmail: false
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
    await prisma.maillog.create({
      data: {
        messageId: deliveryResult.messageId || `msg${nanoid(12)}`,
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
      host: params.host,
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