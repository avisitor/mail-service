import Mustache from 'mustache';
import { getPrisma } from '../../db/prisma.js';
import { sendEmail } from '../../providers/smtp.js';
import { generateToken } from './tokens.js';
import {
  TEMPLATE_KINDS,
  SubscribeTemplateKind,
  getDefaultsFor,
  DEFAULT_SUBSCRIBE_PAGE_SUBMITTED_HTML,
  DEFAULT_UNSUBSCRIBED_PAGE_HTML
} from './defaults.js';
import { isValidEmail } from './service.js';

const PENDING_TTL_HOURS = 48;
const PENDING_TTL_MS = PENDING_TTL_HOURS * 60 * 60 * 1000;

export class SubscribeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface ListContext {
  listName: string;
  appName: string;
}

interface MemberContext {
  memberName: string;
  memberEmail: string;
}

/**
 * Resolve an SMTP `From` for outgoing subscription mails.
 * Mirrors the app -> tenant -> global fallback used by /api/smtp-from
 * (see src/modules/compose/routes.ts).
 */
async function resolveFrom(appId: string): Promise<{ fromName?: string; fromAddress?: string }> {
  const prisma = getPrisma();
  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) return {};
  let cfg =
    (await prisma.smtpConfig.findFirst({ where: { appId, isActive: true } })) ||
    (await prisma.smtpConfig.findFirst({
      where: { scope: 'TENANT', tenantId: app.tenantId, isActive: true }
    })) ||
    (await prisma.smtpConfig.findFirst({ where: { scope: 'GLOBAL', isActive: true } }));
  if (!cfg) return {};
  return {
    fromName: cfg.fromName || undefined,
    fromAddress: cfg.fromAddress || cfg.user || undefined
  };
}

async function getTemplateOverride(listId: number, kind: SubscribeTemplateKind) {
  const prisma = getPrisma();
  return prisma.template.findFirst({
    where: { mailingListId: listId, kind: kind as any, isActive: true },
    orderBy: { version: 'desc' }
  });
}

/**
 * Render a per-list template (override -> default) with Mustache vars.
 * Returns subject (may be null for SUBSCRIBE_PAGE) and rendered HTML.
 */
export async function renderTemplate(
  listId: number,
  kind: SubscribeTemplateKind,
  vars: Record<string, string>
): Promise<{ subject: string | null; html: string }> {
  const override = await getTemplateOverride(listId, kind);
  const defaults = getDefaultsFor(kind);
  const subjectTpl = override?.subject ?? defaults.subject;
  const contentTpl = override?.content ?? defaults.content;
  return {
    subject: subjectTpl ? Mustache.render(subjectTpl, vars) : null,
    html: Mustache.render(contentTpl, vars)
  };
}

export function renderSubmittedPage(vars: Record<string, string>): string {
  return Mustache.render(DEFAULT_SUBSCRIBE_PAGE_SUBMITTED_HTML, vars);
}

export function renderUnsubscribedPage(vars: Record<string, string>): string {
  return Mustache.render(DEFAULT_UNSUBSCRIBED_PAGE_HTML, vars);
}

async function getListBySlug(appId: string, slug: string) {
  const prisma = getPrisma();
  return prisma.mailingList.findFirst({
    where: { appId, subscribeSlug: slug, subscribePageEnabled: true },
    include: { app: true }
  });
}

/**
 * Render the public subscription page for an enabled list.
 * Returns null if the list is not found or the page is disabled.
 */
export async function renderSubscribePage(
  appId: string,
  slug: string,
  baseUrl: string
): Promise<{ html: string; list: { id: number; name: string } } | null> {
  const list = await getListBySlug(appId, slug);
  if (!list) return null;
  const submitUrl = `${baseUrl}/subscribe/${appId}/${encodeURIComponent(slug)}`;
  const { html } = await renderTemplate(list.id, 'SUBSCRIBE_PAGE', {
    listName: list.name,
    appName: list.app.name || list.app.id,
    submitUrl
  });
  return { html, list: { id: list.id, name: list.name } };
}

/**
 * Step 1 of double-opt-in: store a PendingSubscription, send confirm email.
 * Idempotent: re-submitting same email refreshes the pending row + token.
 * Already-confirmed members get the confirm email re-sent (acts as a reminder)
 * but no list mutation. Returns the email used so the caller can render the
 * "check your email" page.
 */
export async function startSubscription(
  appId: string,
  slug: string,
  rawName: string,
  rawEmail: string,
  baseUrl: string
): Promise<{ list: { id: number; name: string }; email: string }> {
  const prisma = getPrisma();
  const list = await getListBySlug(appId, slug);
  if (!list) throw new SubscribeError('Subscription page not found', 404);

  const name = (rawName || '').trim().slice(0, 64);
  const email = (rawEmail || '').trim().toLowerCase();
  if (!isValidEmail(email)) throw new SubscribeError('Please enter a valid email address');

  // Already a confirmed member? Don't leak that fact - just do nothing visible
  // beyond the standard "check your email" response. We skip sending in this
  // case to avoid abuse via the public form.
  const existing = await prisma.mailingListMember.findFirst({
    where: { listId: list.id, email }
  });
  if (existing && existing.confirmedAt) {
    return { list: { id: list.id, name: list.name }, email };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);

  await prisma.pendingSubscription.upsert({
    where: { listId_email: { listId: list.id, email } },
    update: { token, name, expiresAt, createdAt: new Date() },
    create: { listId: list.id, email, name, token, expiresAt }
  });

  const confirmUrl = `${baseUrl}/subscribe/confirm/${token}`;
  const { subject, html } = await renderTemplate(list.id, 'CONFIRM_EMAIL', {
    listName: list.name,
    memberName: name || email,
    memberEmail: email,
    confirmUrl
  });
  const from = await resolveFrom(appId);
  await sendEmail({
    to: email,
    subject: subject || `Please confirm your subscription to ${list.name}`,
    html,
    appId,
    tenantId: list.app.tenantId,
    fromName: from.fromName,
    fromAddress: from.fromAddress
  });

  return { list: { id: list.id, name: list.name }, email };
}

/**
 * Step 2: visitor clicks confirm link. Promotes pending -> member, sends
 * welcome email (with permanent unsubscribe link), and optionally notifies
 * the list creator.
 */
export async function confirmSubscription(
  token: string,
  baseUrl: string
): Promise<{ list: { id: number; name: string }; email: string } | null> {
  const prisma = getPrisma();
  const pending = await prisma.pendingSubscription.findUnique({
    where: { token },
    include: { list: { include: { app: true } } }
  });
  if (!pending) return null;
  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.pendingSubscription.delete({ where: { id: pending.id } }).catch(() => {});
    return null;
  }

  const { list } = pending;
  const unsubscribeToken = generateToken();

  const member = await prisma.mailingListMember.upsert({
    where: { listId_email: { listId: list.id, email: pending.email } },
    update: {
      name: pending.name,
      confirmedAt: new Date(),
      unsubscribeToken: { set: unsubscribeToken }
    },
    create: {
      listId: list.id,
      email: pending.email,
      name: pending.name,
      confirmedAt: new Date(),
      unsubscribeToken
    }
  });

  await prisma.pendingSubscription.delete({ where: { id: pending.id } }).catch(() => {});

  const finalToken = member.unsubscribeToken || unsubscribeToken;
  const unsubscribeUrl = `${baseUrl}/subscribe/unsubscribe/${finalToken}`;
  const memberName = member.name || pending.email;

  const from = await resolveFrom(list.appId);

  const welcome = await renderTemplate(list.id, 'WELCOME_EMAIL', {
    listName: list.name,
    memberName,
    memberEmail: pending.email,
    unsubscribeUrl
  });
  await sendEmail({
    to: pending.email,
    subject: welcome.subject || `Welcome to ${list.name}`,
    html: welcome.html,
    appId: list.appId,
    tenantId: list.app.tenantId,
    fromName: from.fromName,
    fromAddress: from.fromAddress
  });

  if (list.notifyCreatorOnJoin && list.creatorEmail) {
    const notice = await renderTemplate(list.id, 'CREATOR_NOTICE', {
      listName: list.name,
      memberName,
      memberEmail: pending.email
    });
    await sendEmail({
      to: list.creatorEmail,
      subject: notice.subject || `New subscriber on ${list.name}`,
      html: notice.html,
      appId: list.appId,
      tenantId: list.app.tenantId,
      fromName: from.fromName,
      fromAddress: from.fromAddress
    }).catch(err => {
      // Non-fatal: subscriber is already confirmed; creator-notice failure must not roll back the join.
      // eslint-disable-next-line no-console
      console.error('[subscribe] creator-notice send failed:', err);
    });
  }

  return { list: { id: list.id, name: list.name }, email: pending.email };
}

/**
 * Look up a member by their permanent unsubscribe token. Used to render the
 * "are you sure" GET page before the destructive POST.
 */
export async function findByUnsubscribeToken(token: string) {
  const prisma = getPrisma();
  return prisma.mailingListMember.findUnique({
    where: { unsubscribeToken: token },
    include: { list: true }
  });
}

/**
 * Permanently remove a member by their unsubscribe token. Idempotent.
 */
export async function unsubscribeByToken(
  token: string
): Promise<{ list: { id: number; name: string } } | null> {
  const prisma = getPrisma();
  const member = await prisma.mailingListMember.findUnique({
    where: { unsubscribeToken: token },
    include: { list: true }
  });
  if (!member) return null;
  await prisma.mailingListMember.delete({ where: { id: member.id } });
  return { list: { id: member.list.id, name: member.list.name } };
}

/**
 * Background sweep: drop expired pending rows. Safe to call periodically.
 */
export async function sweepExpiredPending(): Promise<number> {
  const prisma = getPrisma();
  const res = await prisma.pendingSubscription.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return res.count;
}

/**
 * Lazily backfill a permanent unsubscribe token for legacy admin-added members
 * who pre-date the token column. Returns the token that should be used.
 */
export async function ensureUnsubscribeToken(memberId: number): Promise<string> {
  const prisma = getPrisma();
  const member = await prisma.mailingListMember.findUnique({ where: { id: memberId } });
  if (!member) throw new SubscribeError('Member not found', 404);
  if (member.unsubscribeToken) return member.unsubscribeToken;
  const token = generateToken();
  await prisma.mailingListMember.update({
    where: { id: memberId },
    data: { unsubscribeToken: token }
  });
  return token;
}

export { TEMPLATE_KINDS };
