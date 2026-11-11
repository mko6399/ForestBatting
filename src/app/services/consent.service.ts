import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ConsentDecision = 'granted' | 'denied';

/**
 * Keys live under the 'consent.' prefix, which StorageService treats as global — a decision
 * about the person's data belongs to the person, not to whichever trail they opened first.
 *
 * These are read and written with localStorage directly rather than through StorageService,
 * because StorageService asks this service whether it is allowed to write at all.
 */
const LS_STORAGE_CONSENT = 'consent.storage';
const LS_LOCATION_CONSENT = 'consent.location';

/**
 * Records what the visitor has agreed to.
 *
 * Two separate decisions, because they are two different asks:
 *  - storage: keeping their walk on their own device (PDPA: ask before storing)
 *  - location: reading GPS, which the trail cannot work without
 *
 * The storage decision itself is written to localStorage even when it is "denied". Recording
 * that someone said no is what stops the app asking again on every page, and is treated as
 * strictly necessary rather than something that needs its own consent.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly _storage = signal<ConsentDecision | null>(null);
  private readonly _location = signal<ConsentDecision | null>(null);

  readonly storage = computed(() => this._storage());
  readonly location = computed(() => this._location());

  /** True while the visitor has not answered the storage question yet. */
  readonly needsStorageDecision = computed(() => this._storage() === null);

  /** Whether the app may write the walk to this device. */
  readonly canStore = computed(() => this._storage() === 'granted');

  /** Whether the visitor has been told why location is needed and agreed to be asked. */
  readonly locationExplained = computed(() => this._location() === 'granted');

  constructor() {
    if (!this.isBrowser) return;
    this._storage.set(this.read(LS_STORAGE_CONSENT));
    this._location.set(this.read(LS_LOCATION_CONSENT));
  }

  setStorageConsent(decision: ConsentDecision): void {
    this._storage.set(decision);
    this.write(LS_STORAGE_CONSENT, decision);
  }

  setLocationConsent(decision: ConsentDecision): void {
    this._location.set(decision);
    this.write(LS_LOCATION_CONSENT, decision);
  }

  /** Lets the visitor change their mind from a settings screen later. */
  reset(): void {
    this._storage.set(null);
    this._location.set(null);
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(LS_STORAGE_CONSENT);
      localStorage.removeItem(LS_LOCATION_CONSENT);
    } catch {
      // Nothing persisted, nothing to remove.
    }
  }

  private read(key: string): ConsentDecision | null {
    try {
      const raw = localStorage.getItem(key);
      return raw === 'granted' || raw === 'denied' ? raw : null;
    } catch {
      return null;
    }
  }

  private write(key: string, decision: ConsentDecision): void {
    try {
      localStorage.setItem(key, decision);
    } catch {
      // Private mode: the decision holds for this session only and will be asked again.
    }
  }
}
