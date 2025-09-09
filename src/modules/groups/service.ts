import { getPrisma } from '../../db/prisma.js';
import { flags } from '../../config.js';
import { renderTemplate } from '../templates/service.js';
import { GroupCreateInput, RecipientIngestInput } from './types.js';

interface MemoryGroup extends GroupCreateInput { id: string; status: string; totalRecipients: number; processedRecipients: number; sentCount: number; failedCount: number; lockVersion: number; }
interface MemoryRecipient { id: string; groupId: string; email: string; name?: string; context: any; status: string; renderedSubject?: string; renderedHtml?: string; renderedText?: string; }

const memGroups: Record<string, MemoryGroup> = {};
const memRecipients: Record<string, MemoryRecipient> = {};

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
      const key = `${groupId}:${r.email}`;
      if (input.dedupe && Object.values(memRecipients).some(x => x.groupId === groupId && x.email === r.email)) continue;
      const id = `rcp_${Object.keys(memRecipients).length + 1}`;
      const rec: MemoryRecipient = { id, groupId, email: r.email, name: r.name, context: r.context, status: 'pending' };
      if (input.renderNow) {
        // Attempt render (ignore errors for now)
        // In-memory path can't look up template content without hitting DB; skip unless template provided later.
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
