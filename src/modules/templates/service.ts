import Mustache from 'mustache';
import { getPrisma } from '../../db/prisma.js';
import { TemplateCreateInput, TemplateUpdateInput } from './types.js';

export async function createTemplate(data: TemplateCreateInput) {
  const prisma = getPrisma();
  return prisma.template.create({ data: { ...data } });
}

export async function updateTemplate(id: string, data: TemplateUpdateInput) {
  const prisma = getPrisma();
  return prisma.template.update({ where: { id }, data: { ...data } });
}

export async function getTemplate(id: string) {
  const prisma = getPrisma();
  return prisma.template.findUnique({ where: { id } });
}

export async function listTemplates(tenantId: string) {
  const prisma = getPrisma();
  return prisma.template.findMany({ where: { tenantId }, orderBy: [{ name: 'asc' }, { version: 'desc' }] });
}

export async function renderTemplate(id: string, context: Record<string, any>) {
  const tpl = await getTemplate(id);
  if (!tpl) return null;
  const html = Mustache.render(tpl.bodyHtml, context);
  const text = tpl.bodyText ? Mustache.render(tpl.bodyText, context) : undefined;
  const subject = Mustache.render(tpl.subject, context);
  return { subject, html, text };
}
