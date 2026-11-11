import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { ConsentService } from './consent.service';
import { SiteService } from './site.service';

/**
 * Keys that belong to the person rather than to a trail, so they survive switching location
 * and are never prefixed. Everything else is stored per site: someone can walk Kachong today
 * and Thung Khai next week, and the two runs must not overwrite each other.
 *
 * 'app.currentSite' is here because it is the value that decides the prefix — scoping it
 * would make it unreadable on the next load.
 */
const GLOBAL_KEYS: ReadonlySet<string> = new Set([
  'username',
  'authToken',
  'selectedLanguage',
  'hasSelectedLanguage',
  'app.currentSite',
  'appVersion',
]);

/** Prefixes that are global too, matched by prefix rather than exact name. */
const GLOBAL_PREFIXES: readonly string[] = ['consent.'];

function isGlobalKey(key: string): boolean {
  return GLOBAL_KEYS.has(key) || GLOBAL_PREFIXES.some(p => key.startsWith(p));
}

export interface CertificateStatsStorage {
  totalCheckpoints: number;
  completedCheckpoints: number;
  totalSteps: number;
  totalCalories: number;
  totalOxygen: number;
  totalPythaside: number;
  starsEarned: number;
}

/** Which run of the stress questionnaire a result belongs to. */
export type StressCheckPhase = 'before' | 'after';

export interface StressResultStorage {
  /** Raw total of all answers (0-15). */
  score: number;
  /** Stress level derived from the score (1-5). */
  level: number;
  /** ISO timestamp of when the questionnaire was completed. */
  completedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private platformId = inject(PLATFORM_ID);
  private site = inject(SiteService);
  private consent = inject(ConsentService);

  /**
   * Stand-in for localStorage used until the visitor agrees to on-device storage, and for the
   * whole session if they decline. The app keeps working — the walk just does not survive a
   * reload — rather than writing to their device before they have said yes.
   */
  private readonly memory = new Map<string, string>();

  /** Where reads and writes should go right now. */
  private get persistAllowed(): boolean {
    return this.consent.canStore();
  }

  /**
   * Move anything buffered in memory onto the device. Called when consent is granted so a
   * language choice or a few checkpoints made before the banner was answered are not lost.
   */
  /**
   * Remove this app's data from the device, keeping the consent decision itself so the banner
   * does not reappear on every page. Used when someone declines on-device storage: anything
   * a previous visit left behind goes, and later writes stay in memory.
   */
  forgetStoredData(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === null) continue;
        if (key.startsWith('consent.')) continue;   // the decision is what stops us re-asking
        doomed.push(key);
      }
      for (const key of doomed) localStorage.removeItem(key);
    } catch (e) {
      console.error('Error clearing stored data after consent was declined', e);
    }
  }

  flushPendingWrites(): void {
    if (!isPlatformBrowser(this.platformId) || !this.persistAllowed) return;
    for (const [key, value] of this.memory.entries()) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Out of quota: leave the rest in memory for this session.
      }
    }
    this.memory.clear();
  }

  /**
   * Turn a plain key into the one actually written to localStorage.
   *
   * Every caller in the app goes through getItem/setItem/removeItem, so scoping here is the
   * only change needed to keep the three locations' progress apart.
   */
  private scoped(key: string): string {
    return isGlobalKey(key) ? key : `site:${this.site.slug()}:${key}`;
  }

  /**
   * Get an item from localStorage
   * @param key The key to retrieve
   * @returns The value or null if not found or not in browser
   */
  getItem(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    const scoped = this.scoped(key);
    try {
      // Memory first: it holds anything written before consent was answered.
      if (this.memory.has(scoped)) return this.memory.get(scoped) ?? null;
      /*
        Reads are not gated on consent. Consent governs whether new data may be written to
        the device; refusing to read what is already there only breaks the app — it cannot
        even load the language the visitor picked, so the language prompt never goes away.
        Declining instead deletes the stored data (see ConsentBannerComponent.decline).
      */
      return localStorage.getItem(scoped);
    } catch (e) {
      console.error(`Error getting item from localStorage: ${key}`, e);
      return null;
    }
  }

  /**
   * Set an item in localStorage
   * @param key The key to set
   * @param value The value to store
   */
  setItem(key: string, value: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const scoped = this.scoped(key);
    if (!this.persistAllowed) {
      this.memory.set(scoped, value);
      return;
    }

    try {
      localStorage.setItem(scoped, value);
    } catch (e) {
      console.error(`Error setting item in localStorage: ${key}`, e);
    }
  }

  /**
   * Remove an item from localStorage
   * @param key The key to remove
   */
  removeItem(key: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const scoped = this.scoped(key);
    this.memory.delete(scoped);

    try {
      localStorage.removeItem(scoped);
    } catch (e) {
      console.error(`Error removing item from localStorage: ${key}`, e);
    }
  }

  /**
   * Clear all items from localStorage
   */
  clear(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      localStorage.clear();
    } catch (e) {
      console.error('Error clearing localStorage', e);
    }
  }

  /**
   * Clear localStorage while preserving specific keys/values.
   * Useful for "reset progress" flows while keeping user preferences.
   */
  clearAllExcept(keysToKeep: string[]): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      /*
        Only this location's data is removed. The previous version called localStorage.clear(),
        which with three trails would mean finishing a walk at one of them silently wiped the
        progress someone had saved at the other two.
      */
      const prefix = `site:${this.site.slug()}:`;
      const keep = new Set(keysToKeep.map(key => this.scoped(key)));

      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === null) continue;
        if (!key.startsWith(prefix)) continue;   // another site, or a global key
        if (keep.has(key)) continue;
        doomed.push(key);
      }

      for (const key of doomed) localStorage.removeItem(key);

      // Globals listed in keysToKeep are untouched above; anything else global that the
      // caller did NOT ask to keep still has to go, matching the old behaviour.
      for (const key of [...GLOBAL_KEYS]) {
        if (!keep.has(key)) localStorage.removeItem(key);
      }
    } catch (e) {
      console.error('Error clearing localStorage (preserving some keys)', e);
    }
  }

  /**
   * Clears all app data but keeps username, language selection and the auth token, so the
   * user is not bounced back to the login page when their progress resets.
   */
  clearAllExceptUserPrefs(): void {
    /*
      The language keys are listed because this method's contract says it keeps the language
      selection, but the old implementation did not: finishing a walk dropped selectedLanguage,
      so a Thai user was sent back to an English UI and asked to pick a language again.
      'app.currentSite' is kept so finishing a trail does not also forget where you are.
    */
    this.clearAllExcept([
      'username',
      'authToken',
      'selectedLanguage',
      'hasSelectedLanguage',
      'app.currentSite',
    ]);
  }

  /**
   * Get a parsed JSON object from localStorage
   * @param key The key to retrieve
   * @returns The parsed object or null if not found
   */
  getObject<T>(key: string): T | null {
    const item = this.getItem(key);
    if (!item) return null;
    try {
      return JSON.parse(item) as T;
    } catch (e) {
      console.error(`Error parsing localStorage item: ${key}`, e);
      return null;
    }
  }

  /**
   * Set an object in localStorage as JSON
   * @param key The key to set
   * @param value The object to store
   */
  setObject(key: string, value: any): void {
    try {
      this.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error stringifying object for localStorage: ${key}`, e);
    }
  }

  // Convenience methods for common keys

  getMissions(): any[] {
    return this.getObject('missions') || [];
  }

  setMissions(missions: any[]): void {
    this.setObject('missions', missions);
  }

  getAuthToken(): string | null {
    return this.getItem('authToken');
  }

  setAuthToken(token: string): void {
    this.setItem('authToken', token);
  }

  getUsername(): string | null {
    return this.getItem('username');
  }

  setUsername(username: string): void {
    this.setItem('username', username);
  }

  getStartTime(): string | null {
    return this.getItem('startTime');
  }

  setStartTime(time: string): void {
    this.setItem('startTime', time);
  }

  getCompletedAt(): string | null {
    return this.getItem('completedAt');
  }

  setCompletedAt(time: string): void {
    this.setItem('completedAt', time);
  }

  getCertificateName(): string | null {
    return this.getItem('certificateName');
  }

  setCertificateName(name: string): void {
    this.setItem('certificateName', name);
  }

  getBotanyStars(): any {
    return this.getObject('botany_stars') || { starsEarned: 0, readMoreClicked: [] };
  }

  setBotanyStars(stars: any): void {
    this.setObject('botany_stars', stars);
  }

  getCertificateStats(): CertificateStatsStorage | null {
    return this.getObject<CertificateStatsStorage>('certificate_stats');
  }

  setCertificateStats(stats: CertificateStatsStorage): void {
    this.setObject('certificate_stats', stats);
  }

  getStressResult(phase: StressCheckPhase): StressResultStorage | null {
    return this.getObject<StressResultStorage>(`stress_result_${phase}`);
  }

  setStressResult(phase: StressCheckPhase, result: StressResultStorage): void {
    this.setObject(`stress_result_${phase}`, result);
  }

  /**
   * Certificate-only mode: set when the user finishes the trail but skips the post-trail
   * stress check. While set, the menu offers only the certificate page.
   */
  getCertificateOnlyMode(): boolean {
    return this.getItem('certificate_only_mode') === 'true';
  }

  setCertificateOnlyMode(enabled: boolean): void {
    if (enabled) {
      this.setItem('certificate_only_mode', 'true');
    } else {
      this.removeItem('certificate_only_mode');
    }
  }

  /**
   * Ready-to-finish: set once the user has completed the post-trail stress check OR pressed
   * Continue on the post-trail prompt (skipping it). Gates the certificate page's Finish
   * button so it only appears after the trail wrap-up.
   */
  getReadyToFinish(): boolean {
    return this.getItem('ready_to_finish') === 'true';
  }

  setReadyToFinish(enabled: boolean): void {
    if (enabled) {
      this.setItem('ready_to_finish', 'true');
    } else {
      this.removeItem('ready_to_finish');
    }
  }

  getCheckpoint20Positioned(): boolean {
    return this.getItem('checkpoint20_positioned') === 'true';
  }

  setCheckpoint20Positioned(): void {
    this.setItem('checkpoint20_positioned', 'true');
  }

  getInRadius(): string | null {
    return this.getItem('isInRadius');
  }

  setInRadius(value: string): void {
    this.setItem('isInRadius', value);
  }

  getInRadiusUntil(): string | null {
    return this.getItem('inRadiusUntil');
  }

  setInRadiusUntil(value: string): void {
    this.setItem('inRadiusUntil', value);
  }

  getCurrentCheckpointId(): string | null {
    return this.getItem('currentCheckpointId');
  }

  setCurrentCheckpointId(id: string): void {
    this.setItem('currentCheckpointId', id);
  }

  getQuestionIndex(checkpointId: number): number | null {
    const idx = this.getItem(`qIdx_${checkpointId}`);
    return idx ? Number(idx) : null;
  }

  setQuestionIndex(checkpointId: number, index: number): void {
    this.setItem(`qIdx_${checkpointId}`, String(index));
  }

  getActivityIndex(checkpointId: number): number | null {
    const idx = this.getItem(`aIdx_${checkpointId}`);
    return idx ? Number(idx) : null;
  }

  setActivityIndex(checkpointId: number, index: number): void {
    this.setItem(`aIdx_${checkpointId}`, String(index));
  }

  getAppVersion(): string | null {
    return this.getItem('appVersion');
  }

  setAppVersion(version: string): void {
    this.setItem('appVersion', version);
  }

  // Cleanup methods

  clearAllAppData(): void {
    const keys = [
      'missions',
      'checkpoint20_positioned',
      'startTime',
      'completedAt',
      'userName',
      'currentCheckpointId',
      'isInRadius',
      'inRadiusUntil',
      'botany_stars',
      'certificate_stats',
      'stress_result_before',
      'stress_result_after',
      'locationTracking.active',
      'locationTracking.points',
      'locationTracking.granted'
    ];
    keys.forEach(key => this.removeItem(key));
  }

  clearAuthData(): void {
    this.removeItem('authToken');
    this.removeItem('username');
  }
}
