import { getPrisma } from '../../db/prisma.js';

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export class MailingListError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

export async function resolveAppId(appIdOrClientId: string): Promise<string | null> {
  const prisma = getPrisma();
  let app = await prisma.app.findUnique({ where: { id: appIdOrClientId } });
  if (!app) app = await prisma.app.findUnique({ where: { clientId: appIdOrClientId } });
  return app?.id ?? null;
}

export async function listLists(appId: string) {
  const prisma = getPrisma();
  const lists = await prisma.mailingList.findMany({
    where: { appId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { members: true } } }
  });
  return lists.map(l => ({
    id: l.id,
    name: l.name,
    appId: l.appId,
    createdAt: l.createdAt,
    memberCount: l._count.members
  }));
}

export async function getListWithMembers(appId: string, id: number) {
  const prisma = getPrisma();
  const list = await prisma.mailingList.findFirst({
    where: { id, appId },
    include: { members: { orderBy: [{ name: 'asc' }, { email: 'asc' }] } }
  });
  return list;
}

export async function createList(appId: string, name: string) {
  const prisma = getPrisma();
  const trimmed = name.trim();
  if (!trimmed) throw new MailingListError('List name is required');
  if (trimmed.length > 128) throw new MailingListError('List name too long (max 128 chars)');
  const existing = await prisma.mailingList.findFirst({
    where: { appId, name: trimmed }
  });
  if (existing) throw new MailingListError('A list with that name already exists', 409);
  return prisma.mailingList.create({ data: { appId, name: trimmed } });
}

export async function renameList(appId: string, id: number, newName: string) {
  const prisma = getPrisma();
  const trimmed = newName.trim();
  if (!trimmed) throw new MailingListError('List name is required');
  if (trimmed.length > 128) throw new MailingListError('List name too long (max 128 chars)');
  const list = await prisma.mailingList.findFirst({ where: { id, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const conflict = await prisma.mailingList.findFirst({
    where: { appId, name: trimmed, NOT: { id } }
  });
  if (conflict) throw new MailingListError('A list with that name already exists', 409);
  return prisma.mailingList.update({ where: { id }, data: { name: trimmed } });
}

export async function deleteList(appId: string, id: number) {
  const prisma = getPrisma();
  const list = await prisma.mailingList.findFirst({ where: { id, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  await prisma.mailingList.delete({ where: { id } });
}

export async function addMember(appId: string, listId: number, name: string, email: string) {
  const prisma = getPrisma();
  const trimmedName = (name || '').trim();
  const trimmedEmail = (email || '').trim();
  if (trimmedName.length > 64) throw new MailingListError('Name too long (max 64 chars)');
  if (!isValidEmail(trimmedEmail)) throw new MailingListError('Invalid email address');
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const existing = await prisma.mailingListMember.findFirst({
    where: { listId, email: trimmedEmail }
  });
  if (existing) {
    return prisma.mailingListMember.update({
      where: { id: existing.id },
      data: { name: trimmedName }
    });
  }
  return prisma.mailingListMember.create({
    data: { listId, name: trimmedName, email: trimmedEmail }
  });
}

export async function updateMember(
  appId: string,
  listId: number,
  memberId: number,
  name: string,
  email: string
) {
  const prisma = getPrisma();
  const trimmedName = (name || '').trim();
  const trimmedEmail = (email || '').trim();
  if (trimmedName.length > 64) throw new MailingListError('Name too long (max 64 chars)');
  if (!isValidEmail(trimmedEmail)) throw new MailingListError('Invalid email address');
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const member = await prisma.mailingListMember.findFirst({ where: { id: memberId, listId } });
  if (!member) throw new MailingListError('Member not found', 404);
  const conflict = await prisma.mailingListMember.findFirst({
    where: { listId, email: trimmedEmail, NOT: { id: memberId } }
  });
  if (conflict) throw new MailingListError('Another member already uses that email', 409);
  return prisma.mailingListMember.update({
    where: { id: memberId },
    data: { name: trimmedName, email: trimmedEmail }
  });
}

export async function removeMember(appId: string, listId: number, memberId: number) {
  const prisma = getPrisma();
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const member = await prisma.mailingListMember.findFirst({ where: { id: memberId, listId } });
  if (!member) throw new MailingListError('Member not found', 404);
  await prisma.mailingListMember.delete({ where: { id: memberId } });
}
