import { Injectable, PLATFORM_ID, Inject, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private storage = inject(StorageService);
  private isInRadius = new BehaviorSubject<boolean>(false);
  isInRadius$ = this.isInRadius.asObservable();
  private currentCheckpointId = new BehaviorSubject<number | null>(null);
  currentCheckpointId$ = this.currentCheckpointId.asObservable();
  private isBrowser: boolean;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // Initialize from localStorage on startup (only in browser)
    if (this.isBrowser) {
      const saved = this.storage.getCurrentCheckpointId();
      if (saved) {
        this.currentCheckpointId.next(Number(saved));
      }
    }
  }

  setInRadius(status: boolean) {
    this.isInRadius.next(status);
    // Store in localStorage to persist the state (only in browser)
    if (this.isBrowser) {
      this.storage.setInRadius(JSON.stringify(status));

      // GPS jitter can briefly flip in/out of radius; keep a short grace window.
      // The guard will allow access if we're within this window.
      if (status) {
        this.storage.setInRadiusUntil(String(Date.now() + 15000));
      }
    }
  }

  getInRadius(): boolean {
    if (!this.isBrowser) return false;
    const stored = this.storage.getInRadius();
    const direct = stored ? JSON.parse(stored) : false;
    if (direct) return true;

    const untilRaw = this.storage.getInRadiusUntil();
    const until = untilRaw ? Number(untilRaw) : 0;
    return Number.isFinite(until) && until > Date.now();
  }

  navigateToMissions() {
    if (this.getInRadius()) {
      this.router.navigate(['/missions']);
      return true;
    }
    return false;
  }

  setCurrentCheckpointId(id: number | null) {
    this.currentCheckpointId.next(id);
    if (!this.isBrowser) return;

    if (id === null) {
      this.storage.removeItem('currentCheckpointId');
    } else {
      this.storage.setCurrentCheckpointId(String(id));
    }
  }

  getCurrentCheckpointId(): number | null {
    if (!this.isBrowser) return null;
    const saved = this.storage.getCurrentCheckpointId();
    return saved ? Number(saved) : null;
  }
}
