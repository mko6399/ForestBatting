import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';

export interface LoginCodeRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export interface LoginCodeResponse {
  message: string;
}

export interface VerifyCodeResponse {
  token: string;
  expiresAt: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  age: string;
  height: number;
}

export interface RegisterResponse {
  token: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private storage = inject(StorageService);
  // Tracks codes generated locally while backend Auth/login and Auth/verify are bypassed.
  private pendingVerifications = new Map<string, string>();

  constructor(private http: HttpClient) { }

  /**
  * Sends a 6-digit verification code to the given email (POST /Auth/login)
   */
  requestLoginCode(firstName: string, lastName: string, email: string): Observable<LoginCodeResponse> {
    if (this.shouldBypassAuth()) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      this.pendingVerifications.set(email, code);
      // No real email provider is wired up in bypass mode, so surface the code for local testing.
      console.warn(`[DEV] Verification code for ${email}: ${code}`);
      return of({ message: 'Verification code sent (dev mode, check console)' });
    }
    const apiUrl = `${environment.apiUrl}/Auth/login`;
    return this.http.post<LoginCodeResponse>(apiUrl, { firstName, lastName, email });
  }

  /**
  * Verifies the 6-digit code and returns the auth token (POST /Auth/verify)
   */
  verifyLoginCode(email: string, code: string): Observable<VerifyCodeResponse> {
    if (this.shouldBypassAuth()) {
      const pendingCode = this.pendingVerifications.get(email);
      if (!pendingCode || pendingCode !== code) {
        return throwError(() => ({ error: { message: 'Invalid verification code' } }));
      }
      this.pendingVerifications.delete(email);
      return of({
        token: 'bypass-auth-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        email,
        firstName: '',
        lastName: ''
      });
    }
    const apiUrl = `${environment.apiUrl}/Auth/verify`;
    return this.http.post<VerifyCodeResponse>(apiUrl, { email, code });
  }

  /**
   * Register new user
   */
  register(userData: RegisterData): Observable<RegisterResponse> {
    if (this.shouldBypassAuth()) {
      return of({
        token: 'bypass-auth-token',
        user: {
          id: 'bypass-user',
          email: userData?.email,
          name: userData?.name
        }
      });
    }
    const apiUrl = `${environment.apiUrl}/Auth/register`;
    return this.http.post<RegisterResponse>(apiUrl, userData);
  }

  private shouldBypassAuth(): boolean {
    // Allow both build-time (environment) and runtime (localStorage) toggles.
    const envBypass = !!(environment as any)?.bypassAuth;
    const storageBypass = this.storage.getItem('bypassAuth') === 'true';
    return envBypass || storageBypass;
  }

  /**
   * Store authentication token in localStorage
   */
  storeAuthToken(token: string): void {
    this.storage.setAuthToken(token);
  }

  /**
   * Store username in localStorage
   */
  storeUsername(username: string): void {
    this.storage.setUsername(username);
  }

  /**
   * Get authentication token from localStorage
   */
  getAuthToken(): string | null {
    return this.storage.getAuthToken();
  }

  /**
   * Get username from localStorage
   */
  getUsername(): string | null {
    return this.storage.getUsername();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getAuthToken() !== null;
  }

  /**
   * Logout user - clear stored data
   */
  logout(): void {
    this.storage.clearAuthData();
  }
}
