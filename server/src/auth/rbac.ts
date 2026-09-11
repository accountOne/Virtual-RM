// Role-based access control — a data-driven permission matrix rather than scattered
// `role === 'X'` checks, so adding a role or changing a policy later is a table edit (spec
// §12: "Architecture phải hỗ trợ policy configurable"). Keeps the existing MAKER/CHECKER/ADMIN
// role model the whole app's UI/guards already depend on — see
// docs/security/security-gap-analysis.md §4 for why this pass doesn't widen the role enum.
import { Role } from './types';

export type Permission = 'READ' | 'ANALYZE' | 'PREPARE' | 'CREATE_REQUEST' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ADMIN';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  MAKER: ['READ', 'ANALYZE', 'PREPARE', 'CREATE_REQUEST', 'SUBMIT'],
  CHECKER: ['READ', 'ANALYZE', 'APPROVE', 'REJECT'],
  ADMIN: ['READ', 'ANALYZE', 'PREPARE', 'CREATE_REQUEST', 'SUBMIT', 'APPROVE', 'REJECT', 'ADMIN'],
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function rolesWithPermission(permission: Permission): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => hasPermission(r, permission));
}
