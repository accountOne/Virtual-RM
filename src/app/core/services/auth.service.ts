import { Injectable, signal } from '@angular/core';

export type UserRole = 'MAKER' | 'CHECKER' | 'ADMIN';

export interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
}

interface Credential {
  password: string;
  role: UserRole;
  displayName: string;
}

/** Demo-only credentials — no real identity provider. Matches the roles requested for
 * this demo: Maker (can create orders, no approval access), Checker (can approve
 * orders), Admin (can manage demo data). */
const DEMO_USERS: Record<string, Credential> = {
  msb_mk: { password: 'msb_mk@2026', role: 'MAKER', displayName: 'Người lập lệnh (Maker)' },
  msb_ck: { password: 'msb_ck@2026', role: 'CHECKER', displayName: 'Người phê duyệt (Checker)' },
  msb_ad: { password: 'msb_ad@2026', role: 'ADMIN', displayName: 'Quản trị viên (Admin)' },
};

const STORAGE_KEY = 'vrm_auth_user';

export const ROLE_LABEL: Record<UserRole, string> = {
  MAKER: 'Maker — Người lập lệnh',
  CHECKER: 'Checker — Người phê duyệt',
  ADMIN: 'Admin — Quản trị viên',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(restore());

  login(username: string, password: string): boolean {
    const key = username.trim().toLowerCase();
    const record = DEMO_USERS[key];
    if (!record || record.password !== password) return false;

    const user: AuthUser = { username: key, role: record.role, displayName: record.displayName };
    this.currentUser.set(user);
    persist(user);
    return true;
  }

  logout(): void {
    this.currentUser.set(null);
    persist(null);
    try {
      localStorage.removeItem('vrm_chat_messages');
    } catch {
      // ignore
    }
  }

  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this.currentUser();
    return !!user && roles.includes(user.role);
  }
}

function restore(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persist(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, etc.) — session just won't survive a refresh.
  }
}
