import { getPrisma } from '../db/prisma.js';

export interface DerivedRolesInput {
  userSub: string;
  tenantId?: string | null;
  appId?: string | null;
}

// Canonical roles used by mail-service today
const VALID_ROLES = new Set(['superadmin','tenant_admin','editor']);

export async function resolveRoles({ userSub, tenantId, appId }: DerivedRolesInput): Promise<string[]> {
  const prisma = getPrisma();
  // Fetch global + scoped bindings in one query to minimize round trips
  const bindings = await prisma.roleBinding.findMany({
    where: {
      userSub,
      OR: [
        { scopeType: 'GLOBAL' },
        tenantId ? { scopeType: 'TENANT', scopeId: tenantId } : undefined,
        appId ? { scopeType: 'APP', scopeId: appId } : undefined,
      ].filter(Boolean) as any
    }
  });
  const roles = new Set<string>();
  for (const b of bindings) {
    if (VALID_ROLES.has(b.role)) roles.add(b.role);
  }
  // Implicit escalation rules (if any) could be added here.
  return Array.from(roles);
}

export async function ensureInitialSuperadmin(userSub: string) {
  const prisma = getPrisma();
  const exists = await prisma.roleBinding.findFirst({ where: { userSub, role: 'superadmin', scopeType: 'GLOBAL' } });
  if (!exists) {
    await prisma.roleBinding.create({ data: { userSub, role: 'superadmin', scopeType: 'GLOBAL', scopeId: null } });
  }
}