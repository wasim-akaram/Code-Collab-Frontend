import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, BehaviorSubject, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RegisterRequest {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  sub?: string;
  username?: string;
  role?: string;
  plan?: string;
  exp?: number;
  iat?: number;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  bio?: string;
  avatarUrl?: string;
  provider: string;
  active: boolean;
  createdAt: string;
  plan?: string;
  planExpiresAt?: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;

  private authState = new BehaviorSubject<boolean>(this.hasValidToken());
  private userState = new BehaviorSubject<string>(this.getUsernameFromToken());
  public isAuthenticated$ = this.authState.asObservable();
  public currentUser$ = this.userState.asObservable();

  // ── Auth state helpers ─────────────────────────────────────────────────────

  hasValidToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;
    if (this.isTokenExpired(token)) {
      // Don't call clearSession() here — it may be invoked during
      // BehaviorSubject initialization when authState/userState don't exist yet.
      localStorage.removeItem('token');
      return false;
    }
    return true;
  }

  // ── Registration flow ──────────────────────────────────────────────────────

  /** Step 1: initiate registration — sends OTP to email. */
  register(userData: RegisterRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/register`, userData, { responseType: 'text' }).pipe(
      timeout(15000)
    );
  }

  emailExists(email: string): Observable<boolean> {
    return this.http.get<boolean>(`${this.apiUrl}/email-exists`, {
      params: { email }
    }).pipe(
      timeout(10000)
    );
  }

  /** Step 2: verify OTP + complete registration. */
  verifyAndRegister(email: string, otp: string): Observable<string> {
    return this.http.post(
      `${this.apiUrl}/verify-and-register?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`,
      {},
      { responseType: 'text' }
    );
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────

  sendOtp(email: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/send-otp?email=${encodeURIComponent(email)}`, {}, { responseType: 'text' });
  }

  verifyOtp(email: string, otp: string): Observable<string> {
    return this.http.post(
      `${this.apiUrl}/verify-otp?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`,
      {},
      { responseType: 'text' }
    );
  }

  // ── Login / Logout ─────────────────────────────────────────────────────────

  login(credentials: LoginRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/login`, credentials, { responseType: 'text' }).pipe(
      tap((token: string) => {
        this.setToken(token);
      })
    );
  }

  // ── Forgot / Reset Password ─────────────────────────────────────────────────

  /** Step 1: Send a password-reset OTP to the user's email. */
  forgotPassword(email: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email }, { responseType: 'text' }).pipe(
      timeout(30000)
    );
  }

  /** Step 2: Verify the OTP and set a new password. */
  resetPassword(email: string, otp: string, newPassword: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/reset-password`, { email, otp, newPassword }, { responseType: 'text' }).pipe(
      timeout(15000)
    );
  }

  logout(): Observable<void> {
    const token = localStorage.getItem('token');
    // Fire backend blacklist — ignore errors (token clears locally regardless)
    if (token) {
      this.http.post(`${this.apiUrl}/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'text'
      }).subscribe({ error: () => {} });
    }
    this.clearSession();
    return of(void 0);
  }

  // ── Token management ───────────────────────────────────────────────────────

  setToken(token: string): boolean {
    // Strip surrounding quotes — backend may return the JWT as a JSON string literal
    const cleanToken = token?.trim().replace(/^"|"$/g, '') || '';
    if (!cleanToken || this.isTokenExpired(cleanToken)) {
      this.clearSession();
      return false;
    }
    localStorage.setItem('token', cleanToken);
    this.authState.next(true);
    this.userState.next(this.getUsernameFromToken());
    return true;
  }

  getToken(): string | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    // Only reject clearly expired tokens; don't be overly strict
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        this.clearSession();
        return null;
      }
    } catch {
      // If we can't parse the token, still send it — let the server decide
    }
    return token;
  }

  getTokenPayload(): AuthTokenPayload | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1])) as AuthTokenPayload;
    } catch {
      return null;
    }
  }

  /** Exchange current token for a fresh one with renewed expiry. */
  refreshToken(): Observable<string> {
    return this.http.post(`${this.apiUrl}/refresh`, {}, { responseType: 'text' }).pipe(
      tap((newToken: string) => this.setToken(newToken))
    );
  }

  // ── Profile endpoints ──────────────────────────────────────────────────────

  /** GET /auth/profile — returns the authenticated user's profile. */
  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiUrl}/profile`);
  }

  /** PUT /auth/profile — update mutable fields (fullName, username, bio, avatarUrl). */
  updateProfile(data: UpdateProfileRequest): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/profile`, data);
  }

  /** PUT /auth/password — change password with old + new. */
  changePassword(data: ChangePasswordRequest): Observable<string> {
    return this.http.put(`${this.apiUrl}/password`, data, { responseType: 'text' });
  }

  // ── User search / lookup ───────────────────────────────────────────────────

  /** GET /auth/search?q= — public username search. */
  searchUsers(q: string): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.apiUrl}/search`, { params: { q } });
  }

  /** GET /auth/users/{id} — get any user's public profile. */
  getUserById(id: number): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiUrl}/users/${id}`);
  }

  // ── Account management ─────────────────────────────────────────────────────

  /** DELETE /auth/deactivate — soft-deactivate own account. */
  deactivateAccount(): Observable<string> {
    return this.http.delete(`${this.apiUrl}/deactivate`, { responseType: 'text' });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private clearSession(): void {
    localStorage.removeItem('token');
    this.authState.next(false);
    this.userState.next('');
  }

  private getUsernameFromToken(): string {
    const payload = this.getTokenPayload();
    return payload?.sub || payload?.username || '';
  }

  /** Returns true if the current user has an active Pro subscription. */
  isPro(): boolean {
    const payload = this.getTokenPayload();
    return payload?.plan === 'PRO';
  }

  /** Returns the current user's email from the JWT sub claim. */
  getCurrentUserEmail(): string {
    const payload = this.getTokenPayload();
    return payload?.sub || payload?.username || '';
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as AuthTokenPayload;
      if (!payload.exp) return false;
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }
}
