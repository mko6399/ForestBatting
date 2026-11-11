import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';
import { LocationTrackingService } from './location-tracking.service';

// Slow enough to be invisible on a phone's battery, often enough that a deploy reaches
// people the same day they walk the trail.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// The service worker only looks for a new version when asked, so nothing is checked until
// the app has finished starting up. This app never reaches ApplicationRef.isStable (it keeps
// timers running), so a plain delay is used rather than waiting on stability.
const FIRST_CHECK_DELAY_MS = 15_000;

/**
 * Keeps installed devices on the current build.
 *
 * The service worker caches the whole app so it works with no signal, which also means a
 * device will happily keep serving the version it already has. This watches for a newly
 * published version and swaps to it — but never in the middle of a walk, because reloading
 * would drop the map and the user's place on the trail.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private platformId = inject(PLATFORM_ID);
  private updates = inject(SwUpdate);
  private locationTracking = inject(LocationTrackingService);

  private updateReady = false;
  private started = false;

  start(): void {
    if (!isPlatformBrowser(this.platformId) || !this.updates.isEnabled) return;
    if (this.started) return;
    this.started = true;

    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.updateReady = true;
        this.applyIfSafe();
      }
    });

    // The cached app has become unusable (files evicted mid-flight). A reload is the only
    // way out, and it is safe: progress lives in localStorage, not in the page.
    this.updates.unrecoverable.subscribe(() => window.location.reload());

    setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS);
    setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS);

    // Coming back to the app is the most likely moment for a deploy to have happened, and
    // the most convenient moment to pick it up.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  private check(): void {
    if (this.updateReady) {
      this.applyIfSafe();
      return;
    }

    this.updates.checkForUpdate().catch(() => {
      // Offline, which is the normal case on the trail. The next check will retry.
    });
  }

  private applyIfSafe(): void {
    // Mid-walk the map, the GPS watch and the checkpoint state are all live. Hold the new
    // version back until tracking stops rather than interrupting the activity.
    if (this.locationTracking.isTracking()) return;

    this.updates
      .activateUpdate()
      .then((activated) => {
        if (activated) window.location.reload();
      })
      .catch(() => {
        // Nothing to activate after all; leave the flag set so a later check retries.
      });
  }
}
