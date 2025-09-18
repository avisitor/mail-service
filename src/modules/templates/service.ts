import { substituteTemplateVariables } from '../../utils/templates.js';
import { getPrisma } from '../../db/prisma.js';
import { TemplateCreateInput, TemplateUpdateInput } from './types.js';

export async function createTemplate(data: any) {
  const prisma = getPrisma();
  // Convert variables to JSON string if it's an object
  const templateData = {
    ...data,
    variables: typeof data.variables === 'string' ? data.variables : JSON.stringify(data.variables || {})
  };
  return prisma.template.create({ data: templateData });
}

export async function updateTemplate(id: string, data: TemplateUpdateInput) {
  const prisma = getPrisma();
  return prisma.template.update({ where: { id }, data: { ...data } });
}

export async function getTemplate(id: string) {
  const prisma = getPrisma();
  return prisma.template.findUnique({ where: { id } });
}

export async function listTemplates(tenantId: string, appId?: string) {
  const prisma = getPrisma();
  // Template table doesn't have tenantId column, query by appId only
  const where = appId ? { appId } : {};
  return prisma.template.findMany({ where, orderBy: [{ name: 'asc' }, { version: 'desc' }] });
}

export async function renderTemplate(id: string, context: Record<string, any>) {
  const tpl = await getTemplate(id);
  if (!tpl) return null;
  
  const recipientContext = context as any; // Cast to RecipientContext since it contains the email field
  const html = tpl.bodyHtml ? substituteTemplateVariables(tpl.bodyHtml, recipientContext) : '';
  const text = tpl.bodyText ? substituteTemplateVariables(tpl.bodyText, recipientContext) : undefined;
  const subject = tpl.subject ? substituteTemplateVariables(tpl.subject, recipientContext) : '';
  
  return { html, text, subject };
}
