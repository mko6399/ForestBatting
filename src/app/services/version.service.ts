import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';
import { LocationTrackingService } from './location-tracking.service';

const DEFAULT_VERSION_CHECK_URL = `${environment.apiUrl}/version`;

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  currentVersion = environment.appVersion;
  /** True only when an update actually discarded a walk the user had in progress. */
  dataReset = false;
  private storage = inject(StorageService);
  private locationTracking = inject(LocationTrackingService);
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  getStoredVersion(): string | null {
    return this.storage.getAppVersion();
  }

  setStoredVersion(version: string): void {
    this.storage.setAppVersion(version);
  }

  async initializeVersion(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    const storedVersion = this.getStoredVersion();
    const appVersion = this.currentVersion;
    let shouldClear = false;

    if (!storedVersion) {
      shouldClear = true;
      console.info('[VersionService] No stored version found; clearing stale app data.');
    } else if (this.compareVersion(storedVersion, appVersion) < 0) {
      shouldClear = true;
      console.info(
        `[VersionService] Stored version "${storedVersion}" is older than current app version "${appVersion}".`
      );
    }

    const serverVersion = await this.fetchServerVersion();
    if (serverVersion) {
      if (!storedVersion || this.compareVersion(storedVersion, serverVersion) < 0) {
        shouldClear = true;
        console.info(
          `[VersionService] Stored version "${storedVersion ?? 'none'}" is older than server version "${serverVersion}".`
        );
      }

      if (this.compareVersion(appVersion, serverVersion) < 0) {
        shouldClear = true;
        console.info(
          `[VersionService] Current app version "${appVersion}" is older than server version "${serverVersion}".`
        );
      }
    }

    if (shouldClear) {
      // Say nothing to someone who had nothing to lose: a first visit, or a return with no
      // walk in progress, clears silently. The notice is only worth showing when a walk was
      // actually discarded — and it should not be the first thing a new visitor reads.
      const hadProgress = this.hasProgressInFlight();
      this.storage.clearAllAppData();
      this.locationTracking.clearSavedPoints();
      this.dataReset = hadProgress;
    }

    this.setStoredVersion(appVersion);
  }

  dismissDataResetNotice(): void {
    this.dataReset = false;
  }

  /** Whether there is a walk underway that clearing would throw away. */
  private hasProgressInFlight(): boolean {
    try {
      if (this.storage.getStartTime()) return true;
      const missions = this.storage.getMissions();
      return Array.isArray(missions) && missions.some((m: any) => m?.reached);
    } catch {
      return false;
    }
  }

  private async fetchServerVersion(): Promise<string | null> {
    const versionUrl = environment.versionCheckUrl || DEFAULT_VERSION_CHECK_URL;
    if (!versionUrl) {
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<unknown>(versionUrl).pipe(timeout(5000))
      );

      if (response && typeof response === 'object') {
        const versionValue =
          (response as any).version ||
          (response as any).appVersion ||
          (response as any).currentVersion ||
          null;

        return typeof versionValue === 'string' ? versionValue : null;
      }
    } catch (error) {
      console.warn('[VersionService] Failed to fetch server version.', error);
    }

    return null;
  }

  private compareVersion(a: string, b: string): number {
    const parse = (value: string) =>
      value
        .split('.')
        .map(part => parseInt(part.replace(/[^0-9]/g, ''), 10) || 0);

    const aParts = parse(a);
    const bParts = parse(b);
    const len = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < len; i++) {
      const aValue = aParts[i] ?? 0;
      const bValue = bParts[i] ?? 0;

      if (aValue > bValue) return 1;
      if (aValue < bValue) return -1;
    }

    return 0;
  }
}
