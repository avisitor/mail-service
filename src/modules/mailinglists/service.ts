import { getPrisma } from '../../db/prisma.js';
import { isValidSlug } from './tokens.js';
import { TEMPLATE_KINDS, type SubscribeTemplateKind, getDefaultsFor } from './defaults.js';

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

export async function createList(
  appId: string,
  name: string,
  createdBy?: string | null,
  creatorEmail?: string | null
) {
  const prisma = getPrisma();
  const trimmed = name.trim();
  if (!trimmed) throw new MailingListError('List name is required');
  if (trimmed.length > 128) throw new MailingListError('List name too long (max 128 chars)');
  const existing = await prisma.mailingList.findFirst({
    where: { appId, name: trimmed }
  });
  if (existing) throw new MailingListError('A list with that name already exists', 409);
  const trimmedEmail = (creatorEmail || '').trim();
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    throw new MailingListError('Invalid creator email');
  }
  return prisma.mailingList.create({
    data: {
      appId,
      name: trimmed,
      createdBy: createdBy || null,
      creatorEmail: trimmedEmail || null
    }
  });
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

export interface SubscribeSettingsInput {
  enabled?: boolean;
  slug?: string | null;
  notifyCreatorOnJoin?: boolean;
  creatorEmail?: string | null;
}

export async function updateSubscribeSettings(
  appId: string,
  listId: number,
  input: SubscribeSettingsInput
) {
  const prisma = getPrisma();
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);

  const data: any = {};
  if (input.enabled !== undefined) data.subscribePageEnabled = !!input.enabled;
  if (input.notifyCreatorOnJoin !== undefined) data.notifyCreatorOnJoin = !!input.notifyCreatorOnJoin;

  if (input.slug !== undefined) {
    if (input.slug === null || input.slug === '') {
      data.subscribeSlug = null;
    } else {
      const slug = String(input.slug).trim().toLowerCase();
      if (!isValidSlug(slug)) {
        throw new MailingListError(
          'Invalid slug (1-64 lowercase letters, digits, dashes; must start/end with alphanumeric)'
        );
      }
      const conflict = await prisma.mailingList.findFirst({
        where: { appId, subscribeSlug: slug, NOT: { id: listId } }
      });
      if (conflict) throw new MailingListError('Slug already in use for this app', 409);
      data.subscribeSlug = slug;
    }
  }

  if (input.creatorEmail !== undefined) {
    if (input.creatorEmail === null || input.creatorEmail === '') {
      data.creatorEmail = null;
    } else {
      const trimmed = String(input.creatorEmail).trim();
      if (!isValidEmail(trimmed)) throw new MailingListError('Invalid creator email');
      data.creatorEmail = trimmed;
    }
  }

  if (data.subscribePageEnabled === true) {
    const finalSlug = data.subscribeSlug !== undefined ? data.subscribeSlug : list.subscribeSlug;
    if (!finalSlug) throw new MailingListError('A slug is required to enable the subscribe page');
  }
  if (data.notifyCreatorOnJoin === true) {
    const finalEmail = data.creatorEmail !== undefined ? data.creatorEmail : list.creatorEmail;
    if (!finalEmail) {
      throw new MailingListError('A creator email is required to enable creator notifications');
    }
  }

  return prisma.mailingList.update({ where: { id: listId }, data });
}

function assertSubscribeKind(kind: string): SubscribeTemplateKind {
  if (!(TEMPLATE_KINDS as readonly string[]).includes(kind)) {
    throw new MailingListError(`Unknown template kind: ${kind}`);
  }
  return kind as SubscribeTemplateKind;
}

export async function getSubscribeTemplate(
  appId: string,
  listId: number,
  rawKind: string
) {
  const prisma = getPrisma();
  const kind = assertSubscribeKind(rawKind);
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const tpl = await prisma.template.findFirst({
    where: { mailingListId: listId, kind: kind as any }
  });
  const defaults = getDefaultsFor(kind);
  if (!tpl) {
    return {
      kind,
      isDefault: true,
      subject: defaults.subject ?? null,
      content: defaults.content
    };
  }
  return {
    kind,
    isDefault: false,
    subject: tpl.subject,
    content: tpl.content,
    id: tpl.id
  };
}

export async function upsertSubscribeTemplate(
  appId: string,
  listId: number,
  rawKind: string,
  input: { subject?: string | null; content?: string }
) {
  const prisma = getPrisma();
  const kind = assertSubscribeKind(rawKind);
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);

  const content = (input.content ?? '').toString();
  if (!content.trim()) throw new MailingListError('Template content is required');
  const subject = input.subject != null ? String(input.subject) : null;

  const existing = await prisma.template.findFirst({
    where: { mailingListId: listId, kind: kind as any }
  });
  if (existing) {
    return prisma.template.update({
      where: { id: existing.id },
      data: { content, subject, isActive: true }
    });
  }
  return prisma.template.create({
    data: {
      appId,
      mailingListId: listId,
      kind: kind as any,
      version: 1,
      title: `${list.name} - ${kind}`.slice(0, 64),
      subject,
      content,
      isActive: true
    }
  });
}

export async function deleteSubscribeTemplate(
  appId: string,
  listId: number,
  rawKind: string
) {
  const prisma = getPrisma();
  const kind = assertSubscribeKind(rawKind);
  const list = await prisma.mailingList.findFirst({ where: { id: listId, appId } });
  if (!list) throw new MailingListError('List not found', 404);
  const existing = await prisma.template.findFirst({
    where: { mailingListId: listId, kind: kind as any }
  });
  if (existing) {
    await prisma.template.delete({ where: { id: existing.id } });
  }
}
