import { Injectable, PLATFORM_ID, WritableSignal, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface TrackedPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

/**
 * What we know about this device's permission to read location.
 * 'unknown' is the honest answer on iOS Safari, which has never implemented
 * navigator.permissions.query() for geolocation — the UI must not treat it as a refusal.
 */
export type LocationPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

const LS_ACTIVE_KEY = 'locationTracking.active';
const LS_POINTS_KEY = 'locationTracking.points';
// Set once the device has actually produced a fix, i.e. the user said yes at some point.
const LS_GRANTED_KEY = 'locationTracking.granted';

// Persisting on every fix meant re-serialising the whole array roughly once a second, which
// on a long walk is quadratic work: noticeable lag and a flat battery. The signal still
// updates on every fix — only the write to storage is batched.
const PERSIST_INTERVAL_MS = 5_000;

// A hard ceiling so a very long session cannot fill the ~5MB localStorage budget. At one fix
// per second this is over five hours of walking; beyond it the oldest fixes are dropped.
const MAX_STORED_POINTS = 20_000;

@Injectable({
  providedIn: 'root'
})
export class LocationTrackingService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private watchId: number | null = null;

  // True once at least one GPS fix has arrived in this browser session,
  // as opposed to points hydrated from localStorage (which can be hours old).
  private hasLiveFix = false;

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersist = false;

  private readonly _isTracking: WritableSignal<boolean> = signal(false);
  private readonly _points: WritableSignal<TrackedPoint[]> = signal([]);
  private readonly _error: WritableSignal<string | null> = signal(null);
  private readonly _isWaitingForFirstFix: WritableSignal<boolean> = signal(false);
  private readonly _permission: WritableSignal<LocationPermissionState> = signal('unknown');
  private readonly _storageFull: WritableSignal<boolean> = signal(false);

  isTracking = computed(() => this._isTracking());
  points = computed(() => this._points());
  lastPoint = computed(() => {
    const pts = this._points();
    return pts.length ? pts[pts.length - 1] : null;
  });
  error = computed(() => this._error());
  isWaitingForFirstFix = computed(() => this._isWaitingForFirstFix());
  /** Best-known permission state; 'unknown' on browsers that will not tell us (iOS Safari). */
  permission = computed(() => this._permission());
  /** True when the device refused to store more points, so the saved track is incomplete. */
  storageFull = computed(() => this._storageFull());

  constructor() {
    if (!this.isBrowser) return;

    this._points.set(this.readPoints());

    if (!('geolocation' in navigator)) {
      this._permission.set('unsupported');
      return;
    }

    // Ask the browser what it already knows. Android Chrome answers; iOS Safari does not
    // implement this for geolocation, so the state simply stays 'unknown'.
    void this.refreshPermissionState();

    // Resume an interrupted session (a refresh mid-walk), but only when this device has
    // granted location before. Calling watchPosition on a cold install would raise the
    // permission prompt with no user gesture behind it, which iOS routinely refuses —
    // the prompt belongs to the Start button instead.
    if (this.readActive() && this.readGranted()) {
      this.start();
    }

    // A phone screen locking mid-walk fires these; flush so a backgrounded tab cannot lose
    // the last few minutes of the track.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushPoints();
    });
    window.addEventListener('pagehide', () => this.flushPoints());
    window.addEventListener('beforeunload', () => this.flushPoints());
  }

  /**
   * Begin tracking. Call this from a user gesture the first time: both iOS and older Android
   * only reliably show the permission prompt when a tap is behind it.
   */
  start(): void {
    if (!this.isBrowser) return;

    if (!('geolocation' in navigator)) {
      this._error.set('Geolocation is not supported in this browser.');
      this._permission.set('unsupported');
      this._isTracking.set(false);
      this.writeActive(false);
      return;
    }

    // Already tracking
    if (this.watchId !== null) {
      this._isTracking.set(true);
      this.writeActive(true);
      return;
    }

    this._error.set(null);
    this._isTracking.set(true);
    this.writeActive(true);

    // Set flag that we're waiting for the first location fix
    this._isWaitingForFirstFix.set(true);

    // Fast first fix: allow cached position to show something quickly.
    // Then watchPosition will refine with high accuracy updates.
    // Mobile devices often need more time to acquire initial GPS lock.
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => this.acceptPosition(pos),
        () => {
          // Ignore; watchPosition will handle errors/permission.
        },
        {
          // Faster: allow a recent cached position, but request fresh fix.
          enableHighAccuracy: false,
          maximumAge: 10_000,  // Reduced from 60s to get fresher position
          timeout: 15_000      // Increased from 5s to give mobile time to acquire GPS lock
        }
      );
    } catch {
      // ignore
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.acceptPosition(pos),
      (err) => {
        const errorMsg = err?.message || 'Failed to get location.';
        this._error.set(errorMsg);

        // Log error details for debugging
        if (err?.code === err.PERMISSION_DENIED) {
          console.warn('🚫 Location permission denied by user');
          this._permission.set('denied');
          this.writeGranted(false);
          this.stop();
        } else if (err?.code === err.POSITION_UNAVAILABLE) {
          console.warn('📍 Position unavailable - device may not have GPS or signal');
        } else if (err?.code === err.TIMEOUT) {
          console.warn('⏱️ Location request timed out - GPS signal may be weak');
        }
      },
      {
        // Keep high accuracy for missions/proximity, but allow some caching
        // so the first visible location arrives faster.
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000  // Increased from 10s to handle weak GPS signals on mobile
      }
    );
  }

  stop(): void {
    if (!this.isBrowser) return;

    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = null;
    this._isTracking.set(false);
    this._isWaitingForFirstFix.set(false);
    this.writeActive(false);
    this.flushPoints();
  }

  /**
   * Whether the latest point came from this session's GPS (rather than only
   * from points restored from storage). Gameplay triggers should require this
   * so stale saved positions can't fire them.
   */
  hasLiveFixThisSession(): boolean {
    return this.hasLiveFix;
  }

  clearSavedPoints(): void {
    if (!this.isBrowser) return;

    this.pendingPersist = false;
    this._storageFull.set(false);
    this._points.set([]);
    this.writeActive(false);
    this.writePoints([]);
  }

  /**
   * Re-read the permission state from the browser. Safe to call anywhere: browsers without
   * navigator.permissions (iOS Safari, older Android WebViews) simply leave it 'unknown'.
   */
  async refreshPermissionState(): Promise<LocationPermissionState> {
    if (!this.isBrowser) return 'unknown';
    if (!('geolocation' in navigator)) {
      this._permission.set('unsupported');
      return 'unsupported';
    }

    const assumeFromHistory = (): LocationPermissionState => (this.readGranted() ? 'granted' : 'unknown');

    try {
      const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (!permissions || typeof permissions.query !== 'function') {
        // No way to ask. Fall back to what this device has done before.
        const assumed = assumeFromHistory();
        this._permission.set(assumed);
        return assumed;
      }

      const status = await permissions.query({ name: 'geolocation' as PermissionName });
      this._permission.set(status.state as LocationPermissionState);

      // Keep it current if the user changes their mind in browser settings.
      status.onchange = () => {
        this._permission.set(status.state as LocationPermissionState);
        if (status.state === 'denied') this.writeGranted(false);
      };

      return status.state as LocationPermissionState;
    } catch {
      // Safari throws for unsupported permission names rather than returning a result.
      const assumed = assumeFromHistory();
      this._permission.set(assumed);
      return assumed;
    }
  }

  // -- Fix handling -------------------------------------------------------------------

  /**
   * Record a fix. The in-memory signal is updated for every single fix, unchanged, so
   * checkpoint proximity behaves exactly as before — only the write to storage is batched.
   */
  private acceptPosition(pos: GeolocationPosition): void {
    const c = pos.coords;
    const next: TrackedPoint = {
      lat: c.latitude,
      lng: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude,
      altitudeAccuracy: c.altitudeAccuracy,
      heading: c.heading,
      speed: c.speed,
      timestamp: pos.timestamp || Date.now()
    };

    this.hasLiveFix = true;
    this._points.set([...this._points(), next]);
    this._isWaitingForFirstFix.set(false);

    if (this._permission() !== 'granted') this._permission.set('granted');
    this.writeGranted(true);

    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.pendingPersist = true;
    if (this.persistTimer !== null) return;

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPoints();
    }, PERSIST_INTERVAL_MS);
  }

  private flushPoints(): void {
    if (!this.isBrowser || !this.pendingPersist) return;
    this.pendingPersist = false;
    this.writePoints(this._points());
  }

  // -- Storage ------------------------------------------------------------------------

  private readActive(): boolean {
    try {
      const raw = localStorage.getItem(LS_ACTIVE_KEY);
      return raw ? JSON.parse(raw) === true : false;
    } catch {
      return false;
    }
  }

  private writeActive(active: boolean): void {
    try {
      localStorage.setItem(LS_ACTIVE_KEY, JSON.stringify(active));
    } catch {
      // ignore
    }
  }

  private readGranted(): boolean {
    try {
      return localStorage.getItem(LS_GRANTED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private writeGranted(granted: boolean): void {
    try {
      localStorage.setItem(LS_GRANTED_KEY, granted ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  private readPoints(): TrackedPoint[] {
    try {
      const raw = localStorage.getItem(LS_POINTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as TrackedPoint[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Persist the track, trimming if the device refuses the write. A silent failure here used
   * to be invisible: the walk kept going, nothing more was saved, and the certificate then
   * reported a fraction of the real distance.
   */
  private writePoints(points: TrackedPoint[]): void {
    let toStore = points.length > MAX_STORED_POINTS
      ? points.slice(points.length - MAX_STORED_POINTS)
      : points;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        localStorage.setItem(LS_POINTS_KEY, JSON.stringify(toStore));
        if (toStore.length < points.length) this._storageFull.set(true);
        return;
      } catch {
        // Out of quota: halve the track, keeping the most recent fixes, and try again.
        if (toStore.length <= 1) break;
        toStore = toStore.slice(Math.floor(toStore.length / 2));
      }
    }

    this._storageFull.set(true);
    console.warn('⚠️ Could not persist the GPS track: device storage is full.');
  }
}
