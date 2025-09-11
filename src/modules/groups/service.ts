import { getPrisma, isPrismaDisabled } from '../../db/prisma.js';
import { renderTemplate } from '../templates/service.js';
import { dbReady } from '../../db/state.js';
import { GroupCreateInput, RecipientIngestInput } from './types.js';
import { sendEmail } from '../../providers/smtp.js';

const MAX_ATTEMPTS = 3;
const RETRYABLE_ERRORS = [/timeout/i, /rate/i, /connection/i];
function isRetryable(err: any) { const msg = String(err?.message || err); return RETRYABLE_ERRORS.some(r => r.test(msg)); }

export async function createGroup(data: GroupCreateInput) {
  const prisma = getPrisma();
  return prisma.messageGroup.create({ data });
}

export async function getGroup(id: string) {
  const prisma = getPrisma();
  return prisma.messageGroup.findUnique({ where: { id } });
}

export async function ingestRecipients(groupId: string, input: RecipientIngestInput) {
  const prisma = getPrisma();
  const rows = await prisma.$transaction(async (tx) => {
    const existing = input.dedupe ? new Set((await tx.recipient.findMany({ where: { groupId }, select: { email: true } })).map(r => r.email)) : new Set<string>();
    const data = input.recipients.filter(r => !existing.has(r.email)).map(r => ({
      groupId,
      email: r.email,
      name: r.name,
      context: r.context,
    }));
    if (!data.length) return [] as any[];
    await tx.recipient.createMany({ data, skipDuplicates: true });
    await tx.messageGroup.update({ where: { id: groupId }, data: { totalRecipients: { increment: data.length } } });
    return data;
  });
  return { added: rows.length };
}

export async function listGroupRecipients(groupId: string) {
  const prisma = getPrisma();
  return prisma.recipient.findMany({ where: { groupId }, take: 200 });
}

export async function scheduleGroup(id: string, when?: Date) {
  const prisma = getPrisma();
  return prisma.messageGroup.update({ where: { id }, data: { status: 'scheduled', scheduledAt: when ?? new Date() } });
}

export async function workerTick(limitGroups = 5, batchSize = 100) {
  // Extra hard guard: only proceed if database preflight succeeded AND url starts with mysql://
  const url = process.env.DATABASE_URL || '';
  if (isPrismaDisabled() || !dbReady || !url.startsWith('mysql://')) {
    return { groupsProcessed: 0 };
  }
  const prisma = getPrisma();
  const groups = await prisma.messageGroup.findMany({
    where: { status: 'scheduled', OR: [ { scheduledAt: null }, { scheduledAt: { lte: new Date() } } ] },
    take: limitGroups,
  });
  for (const g of groups) {
    try {
      await prisma.messageGroup.update({ where: { id: g.id }, data: { status: 'processing', lockVersion: { increment: 1 }, startedAt: new Date() } });
    } catch { continue; }
    let done = false;
    while (!done) {
      const pending = await prisma.recipient.findMany({ where: { groupId: g.id, status: 'pending' }, take: batchSize });
      if (!pending.length) { done = true; break; }
      for (const r of pending) {
        if (g.templateId) {
          try {
            const rendered = await renderTemplate(g.templateId, r.context as any);
            if (rendered) {
              await prisma.recipient.update({ where: { id: r.id }, data: { renderedSubject: rendered.subject, renderedHtml: g.bodyOverrideHtml || rendered.html, renderedText: g.bodyOverrideText || rendered.text, status: 'rendered' } });
              await prisma.messageGroup.update({ where: { id: g.id }, data: { processedRecipients: { increment: 1 } } });
            }
          } catch { /* ignore */ }
        } else {
          await prisma.recipient.update({ where: { id: r.id }, data: { renderedSubject: g.subject, renderedHtml: g.bodyOverrideHtml, renderedText: g.bodyOverrideText, status: 'rendered' } });
          await prisma.messageGroup.update({ where: { id: g.id }, data: { processedRecipients: { increment: 1 } } });
        }
      }
    }
    let sendDone = false;
    while (!sendDone) {
      const toSend = await prisma.recipient.findMany({ where: { groupId: g.id, status: 'rendered' }, take: batchSize });
      if (!toSend.length) { sendDone = true; break; }
      for (const r of toSend) {
        const suppressed = await prisma.suppression.findFirst({ where: { tenantId: g.tenantId, email: r.email } });
        if (suppressed) {
          await prisma.recipient.update({ where: { id: r.id }, data: { status: 'skipped', lastError: 'suppressed' } });
          continue;
        }
        let attempt = 0;
        let sent = false;
        let lastErr: any = null;
        while (attempt < MAX_ATTEMPTS && !sent) {
          attempt += 1;
          try {
            await sendEmail({ to: r.email, subject: r.renderedSubject || 'No Subject', html: r.renderedHtml || undefined, text: r.renderedText || undefined });
            sent = true;
            await prisma.message.create({ data: { recipientId: r.id, sentAt: new Date(), attemptCount: attempt } });
            await prisma.recipient.update({ where: { id: r.id }, data: { status: 'sent', lastError: null, failedAttempts: attempt - 1 } });
            await prisma.messageGroup.update({ where: { id: g.id }, data: { sentCount: { increment: 1 } } });
            await prisma.event.create({ data: { groupId: g.id, recipientId: r.id, type: 'sent' } });
          } catch (e: any) {
            lastErr = e;
            const retryable = isRetryable(e) && attempt < MAX_ATTEMPTS;
            await prisma.message.create({ data: { recipientId: r.id, lastError: (e?.message || 'send error'), attemptCount: attempt } });
            if (!retryable) {
              await prisma.recipient.update({ where: { id: r.id }, data: { status: 'failed', lastError: (e?.message || 'send error'), failedAttempts: attempt } });
              await prisma.messageGroup.update({ where: { id: g.id }, data: { failedCount: { increment: 1 } } });
              await prisma.event.create({ data: { groupId: g.id, recipientId: r.id, type: 'failed', meta: { error: e?.message || 'send error' } } });
            }
          }
        }
        if (!sent && lastErr) {
          // exhausted retries already handled above
        }
      }
    }
    const remaining = await prisma.recipient.count({ where: { groupId: g.id, status: { in: ['pending','rendered'] } } });
    if (remaining === 0) {
      await prisma.messageGroup.update({ where: { id: g.id }, data: { status: 'complete', completedAt: new Date() } });
      await prisma.event.create({ data: { groupId: g.id, type: 'group_complete' } });
    }
  }
  return { groupsProcessed: groups.length };
}
