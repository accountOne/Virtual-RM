// Password hashing — extracted so user-store.ts and any future admin/password-reset flow share
// one implementation. bcrypt (via bcryptjs, pure JS — no native build step) instead of the
// plaintext comparison the old client-side AuthService did.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}
