import { getPrisma } from '../../db/prisma.js';
import { flags } from '../../config.js';
import { renderTemplate } from '../templates/service.js';
import { GroupCreateInput, RecipientIngestInput } from './types.js';
import { sendEmail } from '../../providers/smtp.js';

// Basic retry configuration (future: make configurable)
const MAX_ATTEMPTS = 3; // total attempts per recipient
const RETRYABLE_ERRORS = [/timeout/i, /rate/i, /connection/i];
function isRetryable(err: any) { const msg = String(err?.message || err); return RETRYABLE_ERRORS.some(r => r.test(msg)); }

interface MemoryGroup extends GroupCreateInput { id: string; status: string; totalRecipients: number; processedRecipients: number; sentCount: number; failedCount: number; lockVersion: number; }
interface MemoryRecipient { id: string; groupId: string; email: string; name?: string; context: any; status: string; renderedSubject?: string; renderedHtml?: string; renderedText?: string; failedAttempts: number; lastError: string | null; }
interface MemoryMessage { id: string; recipientId: string; sentAt?: Date; lastError?: string; attemptCount: number; }

const memGroups: Record<string, MemoryGroup> = {};
const memRecipients: Record<string, MemoryRecipient> = {};
const memMessages: Record<string, MemoryMessage> = {};

export async function createGroup(data: GroupCreateInput) {
  if (flags.useInMemory) {
    const id = `grp_${Object.keys(memGroups).length + 1}`;
    const grp: MemoryGroup = { id, status: 'draft', totalRecipients: 0, processedRecipients: 0, sentCount: 0, failedCount: 0, lockVersion: 0, ...data };
    memGroups[id] = grp;
    return grp as any;
  }
  const prisma = getPrisma();
  return prisma.messageGroup.create({ data });
}

export async function getGroup(id: string) {
  if (flags.useInMemory) return memGroups[id] as any || null;
  const prisma = getPrisma();
  return prisma.messageGroup.findUnique({ where: { id } });
}

export async function ingestRecipients(groupId: string, input: RecipientIngestInput) {
  if (flags.useInMemory) {
    const grp = memGroups[groupId];
    if (!grp) throw new Error('Group not found');
    const added: any[] = [];
    for (const r of input.recipients) {
      if (input.dedupe && Object.values(memRecipients).some(x => x.groupId === groupId && x.email === r.email)) continue;
      const id = `rcp_${Object.keys(memRecipients).length + 1}`;
      const rec: MemoryRecipient = { id, groupId, email: r.email, name: r.name, context: r.context, status: 'pending', failedAttempts: 0, lastError: null };
      if (input.renderNow && grp.templateId) {
        try {
          const rendered = await renderTemplate(grp.templateId, r.context);
          if (rendered) {
            rec.renderedSubject = rendered.subject;
            rec.renderedHtml = rendered.html;
            rec.renderedText = rendered.text;
            rec.status = 'rendered';
          }
        } catch { /* ignore */ }
      }
      memRecipients[id] = rec;
      added.push(rec);
    }
    grp.totalRecipients += added.length;
    return { added: added.length };
  }
  const prisma = getPrisma();
  const rows = await prisma.$transaction(async (tx) => {
    const existing = input.dedupe ? new Set((await tx.recipient.findMany({ where: { groupId }, select: { email: true } })).map(r => r.email)) : new Set<string>();
    const data = input.recipients.filter(r => !existing.has(r.email)).map(r => ({
      groupId,
      email: r.email,
      name: r.name,
      context: r.context,
    }));
    if (!data.length) return [];
    await tx.recipient.createMany({ data, skipDuplicates: true });
    await tx.messageGroup.update({ where: { id: groupId }, data: { totalRecipients: { increment: data.length } } });
    return data;
  });
  return { added: rows.length };
}

export async function listGroupRecipients(groupId: string) {
  if (flags.useInMemory) return Object.values(memRecipients).filter(r => r.groupId === groupId) as any;
  const prisma = getPrisma();
  return prisma.recipient.findMany({ where: { groupId }, take: 200 });
}

export async function scheduleGroup(id: string, when?: Date) {
  if (flags.useInMemory) {
    const grp = memGroups[id];
    if (!grp) throw new Error('Group not found');
    if (grp.status !== 'draft') throw new Error('Only draft groups can be scheduled');
    grp.status = 'scheduled';
    if (when) { (grp as any).scheduledAt = when; }
    return grp as any;
  }
  const prisma = getPrisma();
  return prisma.messageGroup.update({ where: { id }, data: { status: 'scheduled', scheduledAt: when ?? new Date() } });
}

export async function workerTick(limitGroups = 5, batchSize = 100) {
  if (flags.useInMemory) {
    const due = Object.values(memGroups).filter(g => g.status === 'scheduled');
    for (const g of due.slice(0, limitGroups)) {
      g.status = 'processing';
      const recs = Object.values(memRecipients).filter(r => r.groupId === g.id && r.status === 'pending');
      for (const r of recs) {
        if (g.templateId) {
          try {
            const rendered = await renderTemplate(g.templateId, r.context);
            if (rendered) {
              r.renderedSubject = rendered.subject;
              r.renderedHtml = rendered.html;
              r.renderedText = rendered.text;
              r.status = 'rendered';
              g.processedRecipients += 1;
            }
          } catch { }
        }
      }
      const renderedToSend = Object.values(memRecipients).filter(r => r.groupId === g.id && r.status === 'rendered');
      for (const r of renderedToSend) {
        const msgId = `msg_${Object.keys(memMessages).length + 1}`;
        try {
          await sendEmail({ to: r.email, subject: r.renderedSubject || 'No Subject', html: r.renderedHtml, text: r.renderedText });
          r.status = 'sent';
          g.sentCount += 1;
          memMessages[msgId] = { id: msgId, recipientId: r.id, sentAt: new Date(), attemptCount: r.failedAttempts + 1 };
        } catch (e: any) {
          r.status = 'failed';
          r.failedAttempts += 1;
          r.lastError = e?.message || 'send error';
          g.failedCount += 1;
          memMessages[msgId] = { id: msgId, recipientId: r.id, lastError: r.lastError || undefined, attemptCount: r.failedAttempts };
        }
      }
    }
    return { groupsProcessed: Math.min(due.length, limitGroups) };
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
              await prisma.recipient.update({ where: { id: r.id }, data: { renderedSubject: rendered.subject, renderedHtml: rendered.html, renderedText: rendered.text, status: 'rendered' } });
              await prisma.messageGroup.update({ where: { id: g.id }, data: { processedRecipients: { increment: 1 } } });
            }
          } catch { }
        }
      }
    }
    let sendDone = false;
    while (!sendDone) {
      const toSend = await prisma.recipient.findMany({ where: { groupId: g.id, status: 'rendered' }, take: batchSize });
      if (!toSend.length) { sendDone = true; break; }
      for (const r of toSend) {
        // Suppression check
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
          // exhausted retries already handled above; nothing extra here for now
        }
      }
    }
    // finalize group if all recipients terminal
    const remaining = await prisma.recipient.count({ where: { groupId: g.id, status: { in: ['pending','rendered'] } } });
    if (remaining === 0) {
      await prisma.messageGroup.update({ where: { id: g.id }, data: { status: 'complete', completedAt: new Date() } });
      await prisma.event.create({ data: { groupId: g.id, type: 'group_complete' } });
    }
  }
  return { groupsProcessed: groups.length };
}
