// Demo user directory — migrated from the old client-side AuthService's DEMO_USERS map.
// Same three accounts, same passwords, now hashed and checked server-side instead of shipped
// in plaintext inside the Angular bundle. See docs/security/authentication.md.
import { customerRepository } from '../repositories';
import { hashPassword } from './password';
import { Role } from './types';

export interface DemoUserRecord {
  username: string;
  passwordHash: string;
  role: Role;
  displayName: string;
  active: boolean;
}

const USERS: DemoUserRecord[] = [
  { username: 'msb_mk', passwordHash: hashPassword('msb_mk@2026'), role: 'MAKER', displayName: 'Người lập lệnh (Maker)', active: true },
  { username: 'msb_ck', passwordHash: hashPassword('msb_ck@2026'), role: 'CHECKER', displayName: 'Người phê duyệt (Checker)', active: true },
  { username: 'msb_ad', passwordHash: hashPassword('msb_ad@2026'), role: 'ADMIN', displayName: 'Quản trị viên (Admin)', active: true },
];

export function findUser(username: string): DemoUserRecord | undefined {
  const key = username.trim().toLowerCase();
  return USERS.find((u) => u.username === key);
}

/** Single-tenant demo (see docs/security/security-gap-analysis.md §1.4/§3) — every demo user
 * belongs to the one seeded company, resolved server-side exactly like
 * semantic-engine.ts::buildSecurityContext already did before sessions existed. Never derived
 * from client input. */
export function companyIdForUser(_user: DemoUserRecord): string {
  return customerRepository.read().customerId;
}
