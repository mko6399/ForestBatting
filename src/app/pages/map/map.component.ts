// import { Component, AfterViewInit, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BaseDataService } from '../../services/base-data.service';
import { Component, OnInit, AfterViewInit, inject, PLATFORM_ID, OnDestroy, signal, WritableSignal, ChangeDetectionStrategy, effect, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationService } from '../../services/navigation.service';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { StorageService } from '../../services/storage.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { LocationTrackingService, TrackedPoint } from '../../services/location-tracking.service';
import { AudioService } from '../../services/audio.service';
import { AppStateService } from '../../services/app-state.service';
declare const L: any;

// --- INTERFACE AND DATA ---

interface Question {
  id: string;
  question: string;
  choices: Record<string, string>;
}

interface Activity {
  text: string;
}

interface Checkpoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  mission: string;
  reached: boolean;
  photo?: string;
  answer?: string;
  question?: string;
  type?: 'question_forest_bathing' | 'activity_forest_bathing' | 'activity_forest_bathing_photo' | 'question_botany' | 'writing_reflection';
  readMore?: string;
  questions?: Question[];
  activities?: string[];
  steps?: string[];
  activity?: string;
  certificate?: string[];
  starEarned?: boolean;
}


const INITIAL_CHECKPOINTS: Checkpoint[] = [];

// Fix for marker icons (using CDN fallback) - This must be defined AFTER L is declared.
let defaultIcon: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements AfterViewInit {
  private map!: any;
  private destroyed = false;
  private streetTiles: any | null = null;
  private satelliteTiles: any | null = null;
  private userMarker: any | null = null;
  private hasAutoCenteredOnUser = false;
  private shouldFollowUser = true; // Stop following user after first auto-center
  private vectorRenderer: any | null = null;
  private isNavigatingToMissions = false;
  private lastRadiusTrigger: { id: number; at: number } | null = null;
  private notificationAudioContext: any | null = null;
  private lastInRadius = false; // Track if user was in radius to detect exit
  private platformId = inject(PLATFORM_ID);
  private storage = inject(StorageService);
  private baseDataService = inject(BaseDataService);
  private imageUploadService = inject(ImageUploadService);
  private locationTracking = inject(LocationTrackingService);
  private injector = inject(Injector);
  public audio = inject(AudioService);
  private readonly baseCheckpointsSig = this.baseDataService.getCheckpointsDataSignal();
  private checkpointIcon: any | null = null;

  // State using Signals
  checkpoints: WritableSignal<Checkpoint[]> = signal(INITIAL_CHECKPOINTS);
  selectedCheckpoint: WritableSignal<Checkpoint | null> = signal(null);
  showDialog: WritableSignal<boolean> = signal(false);
  isSatellite = signal(false);
  isMapLoaded: WritableSignal<boolean> = signal(false); // New signal for loading state
  isTracking: WritableSignal<boolean> = signal(false); // GPS tracking state
  userLatLng: WritableSignal<[number, number] | null> = signal(null); // Latest user location
  userPath: WritableSignal<[number, number][][]> = signal<[number, number][][]>([], { equal: () => false }); // User's tracked path, split into segments (a GPS gap starts a new segment instead of a straight bridge)
  isDrawingMode: WritableSignal<boolean> = signal(false); // Path drawing mode
  customPath: WritableSignal<[number, number][]> = signal<[number, number][]>([], { equal: () => false }); // Custom drawn path
  guidePath: WritableSignal<[number, number][]> = signal([]); // Existing/loaded guide path (separate layer)
  isTrackingPaused: WritableSignal<boolean> = signal(false); // Track if GPS tracking was paused for mission
  starsEarned: WritableSignal<number> = signal(0); // Track stars earned from readMore links
  readMoreClicked: WritableSignal<Set<string>> = signal(new Set()); // Track which readMore links were clicked (checkpoint id)
  appState = inject(AppStateService); // Global app state including soundEnabled

  centerOnMe(): void {
    const latlng = this.userLatLng();
    if (!this.map || !latlng) return;
    this.map.setView(latlng, 17, { animate: true });
  }

  private checkpointCircles: any[] = [];
  private checkpointMarkers: any[] = [];
  private userPathPolyline: any | null = null; // User's tracked GPS path
  private userPathBorder: any | null = null; // White border for user's tracked path
  private customPathPolyline: any | null = null; // Custom drawn path
  private customPathBorder: any | null = null; // White border for custom path
  private guidePathPolyline: any | null = null; // Existing/loaded guide path
  private guidePathBorder: any | null = null; // White border for guide path
  private customPathDirectionMarkers: any[] = []; // Direction arrows for custom path
  private guidePathDirectionMarkers: any[] = []; // Direction arrows for guide path
  private drawingMarkers: any[] = []; // Markers for path editing
  private notificationPermission: boolean = false;

  private syncedTrackingPointCount = 0;

  private lastTrackingActive = false;

  // --- Trail cleanup state (affects ONLY the drawn green line, never checkpoint detection) ---
  private lastTrailPoint: { lat: number; lng: number; t: number; acc?: number } | null = null; // last fix accepted into the trail
  private consecutiveTrailSpikes = 0; // consecutive rejected outliers, for self-recovery
  // A gap longer than this (app backgrounded / screen locked) starts a NEW segment so the
  // two fixes aren't bridged with a misleading straight line.
  private readonly TRAIL_GAP_MS = 20_000;
  // A jump faster than this over a short interval is treated as a GPS spike and dropped
  // (walking/running never exceeds it; only erroneous fixes do).
  private readonly TRAIL_MAX_SPEED_KMH = 30;
  // Ignore jitter below this distance when spike-checking, so small wobble is kept.
  private readonly TRAIL_MIN_SPIKE_M = 30;
  // Stationary deadband: while standing still GPS noise bounces the fix around — often
  // further than the reported accuracy. Treat any new fix within this radius of the last
  // accepted position as "not moved" so the user marker and the drawn trail stay still
  // instead of jittering back and forth. The radius scales with the reported accuracy so
  // noisy fixes (e.g. under tree canopy) need a clearer move to count, matching the
  // certificate's distance/step filter.
  // NOTE: gameplay (checkpoint proximity) still uses the RAW fix, so triggers are unchanged.
  private readonly MIN_MOVE_DEADBAND_M = 8;
  private readonly ACCURACY_DEADBAND_FACTOR = 1.5;
  private lastMarkerLatLng: [number, number] | null = null; // anchor for the displayed marker

  private readonly defaultRouteAssetUrl = 'assets/route/botany-route-1765541958425.json';
  private readonly returnRouteAssetUrl = 'assets/route/botany-route-1765541958425-return.json';
  private didAttemptLoadCustomPath = false;

  private readonly drawnRouteStorageKey = 'drawnRoutePath';

  private isFreehandPointerDown = false;
  private lastDrawPoint: [number, number] | null = null;
  private lastDrawTimeMs = 0;
  private drawHandlersAttached = false;

  private readonly handleDrawStart = (e: any) => {
    if (!this.isDrawingMode()) return;
    this.isFreehandPointerDown = true;
    this.addDrawPointFromEvent(e, true);
  };

  private readonly handleDrawMove = (e: any) => {
    if (!this.isDrawingMode() || !this.isFreehandPointerDown) return;
    this.addDrawPointFromEvent(e, false);
  };

  private readonly handleDrawEnd = () => {
    if (!this.isDrawingMode()) return;
    this.isFreehandPointerDown = false;
    this.lastDrawPoint = null;
  };
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  checkDistanceTo: any;

  constructor(
    private navigationService: NavigationService,
    private router: Router,
    private route: ActivatedRoute,
    public languageService: LanguageService
  ) {
    // Notification permission is NOT requested here. Safari 16.4+ only honours
    // Notification.requestPermission() when a user gesture is behind it, so asking from the
    // constructor was auto-denied on iOS and could not be asked again without the user
    // digging through Settings. It is requested from startTracking() instead.
    this.notificationPermission = this.hasNotificationPermission();
    this.registerServiceWorker(); // Will work on HTTPS
  }

  /** Whether notifications are already granted, without prompting. */
  private hasNotificationPermission(): boolean {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }

  // Expose translations for template
  get t(): any {
    return this.languageService.t() as any;
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.storage.removeItem('showCheckpoint17RouteMessage');

    // Restore the last drawn (red) path so it can be continued or exported later.
    this.loadDrawnPathFromLocalStorage();

    // Ensure base bilingual data is loaded, then sync/merge into storage.
    this.baseDataService.loadBasesData().subscribe({
      next: () => {
        const baseCheckpoints = this.baseCheckpointsSig() as unknown as Checkpoint[];
        this.syncFromBase(baseCheckpoints);
      },
      error: (error) => {
        console.error('Failed to load base data:', error);

        // Fallback to whatever is already persisted
        const saved = this.storage.getMissions();
        if (saved && saved.length > 0) {
          this.checkpoints.set(saved);
        } else {
          this.checkpoints.set([]);
        }
      }
    });

    // Load earned stars
    this.loadEarnedStars();
  }

  private readonly syncEffect = effect(
    () => {
      if (!isPlatformBrowser(this.platformId)) return;

      // Track language changes.
      this.languageService.currentLanguage();

      // Re-run once the Leaflet map has finished loading. On an SPA navigation to this
      // page this effect first runs before ngAfterViewInit has built the map, so
      // syncFromBase() -> initializeCheckpoints() is skipped (this.map is null) and the
      // checkpoints — and the checkpoint-17 route notice — never render until a GPS fix
      // or a manual refresh. Depending on isMapLoaded() makes it fire again when ready.
      this.isMapLoaded();

      const baseCheckpoints = this.baseCheckpointsSig() as unknown as Checkpoint[];
      if (baseCheckpoints.length === 0) return;

      this.syncFromBase(baseCheckpoints);
    },
    { injector: this.injector }
  );

  private readonly trackingEffect = effect(
    () => {
      if (!isPlatformBrowser(this.platformId)) return;

      // Re-run this effect once the Leaflet map has finished loading. When navigating
      // back to this page without a full reload, the effect first runs before
      // ngAfterViewInit has created the map, so the last known GPS fix is consumed
      // while `this.map` is still null and the user marker / checkpoints never render
      // until the next fix or a manual refresh. Depending on isMapLoaded() makes the
      // effect fire again the moment the map is ready and replays the location below.
      this.isMapLoaded();

      // Mirror tracking state from the root service
      const active = this.locationTracking.isTracking();
      this.isTracking.set(active);

      // When tracking starts, hide any pre-existing paths (guide/custom) so the user's tracked path is the focus.
      // When tracking stops, restore them.
      if (active !== this.lastTrackingActive) {
        if (active) {
          this.onTrackingStarted();
        } else {
          this.onTrackingStopped();
        }
        this.lastTrackingActive = active;
      }

      const points = this.locationTracking.points();

      // Reset if points were cleared
      if (points.length === 0) {
        if (this.syncedTrackingPointCount !== 0 || this.userPath().length) {
          this.resetTrail();
        }
        return;
      }

      // Initial hydration (e.g. after refresh): rebuild the whole trail from saved points.
      if (this.syncedTrackingPointCount === 0) {
        this.rebuildTrail(points);
        this.syncedTrackingPointCount = points.length;
      } else if (points.length > this.syncedTrackingPointCount) {
        // Incremental: feed only the new raw fixes through the trail cleaner.
        const segments = this.userPath();
        let changed = false;
        for (const p of points.slice(this.syncedTrackingPointCount)) {
          if (this.pushTrailPoint(segments, p)) changed = true;
        }
        this.syncedTrackingPointCount = points.length;
        if (changed) {
          this.userPath.set(segments);
          if (this.map) this.updateUserPathPolyline();
        }
      }

      const last = points[points.length - 1];
      if (!last || !this.isFiniteNumber(last.lat) || !this.isFiniteNumber(last.lng)) return;

      // Marker & checkpoint detection intentionally use the RAW latest fix so gameplay
      // (proximity triggers) stays identical to before; only the drawn trail is cleaned.
      this.userLatLng.set([last.lat, last.lng]);
      if (this.map) {
        this.updateUserLocation(last.lat, last.lng);
        // Proximity capture only while tracking is active AND at least one live GPS
        // fix arrived this session: points hydrated from storage can be hours old
        // and must not mark checkpoints as reached. In-field behavior is unchanged —
        // while tracking, every appended point is a live fix, including when the map
        // is re-entered mid-walk (the service is root-scoped and keeps the flag).
        if (active && this.locationTracking.hasLiveFixThisSession()) {
          this.checkCheckpointProximity(last.lat, last.lng);
        }
        // Only follow user if we haven't auto-centered yet (initial first load)
        if (active && this.shouldFollowUser && !this.hasAutoCenteredOnUser) {
          this.followUserWhileTracking(last.lat, last.lng);
        }
      }
    },
    { injector: this.injector }
  );

  private onTrackingStarted(): void {
    if (!this.map) return;

    // Hide the existing guide route and any custom/drawn route overlays.
    this.removeGuidePathLayersOnly();
    this.removeCustomPathLayersOnly();

    // Pan to the user (if we already have a position), but don't force re-centering if user already panned/zoomed.
    // Only pan if map hasn't been manually adjusted by the user.
    const latlng = this.userLatLng();
    if (latlng && !this.hasAutoCenteredOnUser) {
      const currentZoom = this.map?.getZoom?.() ?? 17;
      const targetZoom = Math.max(currentZoom, 18);
      this.map.setView(latlng, targetZoom, { animate: true });
      this.hasAutoCenteredOnUser = true;
      this.shouldFollowUser = false; // Stop auto-following after initial center
    } else if (latlng) {
      // If already centered, just pan to user without forcing zoom
      this.map.panTo(latlng, { animate: true });
    }
  }

  private onTrackingStopped(): void {
    if (!this.map) return;

    // Reset follow user flag for next tracking session
    this.shouldFollowUser = true;

    // Restore the underlying route overlays.
    this.updateGuidePathPolyline();
    this.updateCustomPathPolyline();
  }

  private followUserWhileTracking(lat: number, lng: number): void {
    if (!this.map) return;

    const latlng: [number, number] = [lat, lng];
    const currentZoom = this.map?.getZoom?.() ?? 17;
    const targetZoom = 18;

    // Keep the user centered while tracking.
    // Only force zoom-in if the user is too zoomed out.
    // Prefer panning to keep the view stable and allow user to drag/zoom without interference.
    if (currentZoom < targetZoom) {
      this.map.setView(latlng, targetZoom, { animate: true });
    } else {
      // Use panTo to gently keep user in view without forcing zoom changes
      this.map.panTo(latlng, { animate: false });
    }
  }

  private removeCustomPathLayersOnly(): void {
    if (this.customPathBorder) {
      this.customPathBorder.remove();
      this.customPathBorder = null;
    }
    if (this.customPathPolyline) {
      this.customPathPolyline.remove();
      this.customPathPolyline = null;
    }
    this.clearDirectionMarkers(this.customPathDirectionMarkers);
  }

  private removeGuidePathLayersOnly(): void {
    if (this.guidePathBorder) {
      this.guidePathBorder.remove();
      this.guidePathBorder = null;
    }
    if (this.guidePathPolyline) {
      this.guidePathPolyline.remove();
      this.guidePathPolyline = null;
    }
    this.clearDirectionMarkers(this.guidePathDirectionMarkers);
  }

  private syncFromBase(baseCheckpoints: Checkpoint[]): void {
    const saved = this.storage.getMissions();

    if (saved && saved.length > 0) {
      const merged = baseCheckpoints.map(cp => {
        const savedCp = saved.find(s => s.id === cp.id);
        if (!savedCp) return cp;

        return {
          ...cp,
          reached: savedCp.reached,
          photo: savedCp.photo || undefined,
          answer: savedCp.answer || undefined,
          question: savedCp.question ?? (cp as any).question,
          starEarned: (savedCp as any).starEarned ?? (cp as any).starEarned
        };
      });

      this.checkpoints.set(merged);
      this.storage.setMissions(merged);
    } else {
      this.checkpoints.set(baseCheckpoints);
      this.storage.setMissions(baseCheckpoints);
    }

    // Render (or refresh) the leaflet markers/popups whenever the map is ready. This also
    // covers the case where checkpoint data resolves from the network AFTER the map has
    // initialized (navigating back without a reload): without this, nothing would draw the
    // checkpoints — and the checkpoint-17 route notice would never be evaluated — until the
    // next GPS fix. initializeCheckpoints() clears and rebuilds, so repeat calls are safe.
    if (this.map) {
      this.initializeCheckpoints();
    }
  }

  ngAfterViewInit(): void {
  if (!isPlatformBrowser(this.platformId)) return;
    // 1. Leaflet ships with the app (see angular.json assets), so the map still works with
    //    no signal. index.html loads it, this only waits for it in case that is still pending.
    this.loadScript('vendor/leaflet/leaflet.js')
      .then(() => {
        // 2. Leaflet is now globally available as 'L'. Define default icon here.
        defaultIcon = L.icon({
          iconUrl: 'vendor/leaflet/images/marker-icon.png',
          iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png',
          shadowUrl: 'vendor/leaflet/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          tooltipAnchor: [16, -28],
          shadowSize: [41, 41]
        });
        L.Marker.prototype.options.icon = defaultIcon;

        // 3. Load the locate control plugin (which expects L to be present)
        return this.loadScript('vendor/leaflet-locatecontrol/L.Control.Locate.min.js');
      })
      .then(() => {
        if (this.destroyed) return;
        // Avoid double-initializing the map if the view re-enters quickly.
        if (this.map) return;
        // 5. Initialize the map once all scripts are loaded
        // Define a distinct icon for checkpoints (green), user stays blue
        this.checkpointIcon = L.icon({
          iconUrl: 'assets/images/marker-green.svg',
          shadowUrl: 'vendor/leaflet/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });
        this.initMap();
        this.isMapLoaded.set(true);
        // Ensure map sizes correctly
        setTimeout(() => this.invalidateMapSize(), 50);
        if (typeof window !== 'undefined') {
          window.addEventListener('resize', this.invalidateMapSize);
          window.addEventListener('layout-changed', this.invalidateMapSize as any);
        }
      })
      .catch(error => {
        console.error("Failed to load map libraries:", error);
      });
  }

  // Utility function to load a script
  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = (error) => reject(error);
      document.head.appendChild(script);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.walkerStopTimer) clearTimeout(this.walkerStopTimer);
    this.clearFootprints();
    document.documentElement.classList.remove('map-moving');
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.invalidateMapSize);
      window.removeEventListener('layout-changed', this.invalidateMapSize as any);
    }
    // Clean up map and route paths

    if (this.userPathPolyline) {
      this.userPathPolyline.remove();
    }
    if (this.userPathBorder) {
      this.userPathBorder.remove();
    }
    this.clearDirectionMarkers(this.customPathDirectionMarkers);
    this.clearDirectionMarkers(this.guidePathDirectionMarkers);
    if (this.map) {
      this.map.remove();
    }
  }

  private resetLeafletContainer(containerId: string): void {
    try {
      if (typeof document === 'undefined') return;
      const el = document.getElementById(containerId) as any;
      if (!el) return;

      // Leaflet stores an internal id on the DOM element; if it remains,
      // calling L.map(el) again throws "Map container is already initialized".
      if (el._leaflet_id) {
        try {
          delete el._leaflet_id;
        } catch {
          el._leaflet_id = null;
        }
      }
    } catch {
      // ignore
    }
  }

  // Bound method to invalidate Leaflet size on layout changes
  private invalidateMapSize = () => {
    try { if (this.map) { this.map.invalidateSize(); } } catch {}
  }

  /**
   * Ask for notification permission. Must be reached from a user gesture: iOS refuses the
   * request otherwise, and a refusal is sticky until the user clears it in Settings.
   * On iOS the Notification API only exists at all in an installed PWA, so plain Safari
   * simply skips this — checkpoints still alert in-app via showVisualAlert/vibrate.
   */
  private async requestNotificationPermission(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'default') {
      this.notificationPermission = Notification.permission === 'granted';
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission === 'granted';

      if (permission === 'granted') {
        console.log('✅ Notification permission granted');
      } else if (permission === 'denied') {
        console.log('❌ Notification permission denied');
      }
    } catch {
      // Older Safari exposes only the callback form and throws on the promise form.
      this.notificationPermission = false;
    }
  }

  private async registerServiceWorker(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return;
    }

    // Check if we're on HTTPS or localhost (Service Workers require secure context)
    const isSecureContext = window.isSecureContext ||
                           window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';

    if (!isSecureContext) {
      console.warn('⚠️ Service Workers require HTTPS. Running on HTTP:', window.location.origin);
      console.warn('📱 Notifications will use fallback method (may not appear in notification tray on mobile)');
      return;
    }

    try {
      // Register the notification worker under a dedicated, narrow scope so it coexists
      // with Angular's PWA worker (ngsw-worker.js) at '/' instead of replacing it at the
      // same scope. We only need the registration reference for registration.showNotification();
      // this worker does not need to control any pages.
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw-notification.js', {
        scope: '/checkpoint-notify/'
      });
      console.log('✅ Notification Service Worker registered:', this.serviceWorkerRegistration);
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      console.error('Will use fallback notification method');
    }
  }

  private async showNotification(checkpointName: string, distance: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    console.log('🔔 Notification triggered for:', checkpointName, 'at', distance, 'm');
    console.log('Permission granted:', this.notificationPermission);

    // Try Service Worker first (works on HTTPS, shows in notification tray)
    if (this.notificationPermission && this.serviceWorkerRegistration) {
      try {
        await this.serviceWorkerRegistration.showNotification('🎯 Checkpoint Reached!', {
          body: `You have reached ${checkpointName}!\nDistance: ${Math.round(distance)}m`,
          icon: 'assets/images/marker-green.svg',
          badge: 'assets/images/marker-green.svg',
          tag: `checkpoint-${checkpointName}`,
          requireInteraction: false,
          silent: false
        });
        console.log('✅ Service Worker notification sent to tray');
      } catch (error) {
        console.error('❌ Service Worker notification failed:', error);
        this.showFallbackNotification(checkpointName, distance);
      }
    } else if (this.notificationPermission && 'Notification' in window) {
      // Fallback to browser notification (desktop)
      this.showFallbackNotification(checkpointName, distance);
    } else {
      console.log('❌ Notification permission not granted');
    }

    // Mobile vibration (works even without notification permission)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
      console.log('✅ Vibration triggered');
    } else {
      console.log('❌ Vibration not supported');
    }

    // Play notification sound
    this.playNotificationSound();

    // Show visual alert on screen (this ALWAYS works)
    this.showVisualAlert(checkpointName, distance);
    console.log('✅ Visual alert displayed');
  }

  private showFallbackNotification(checkpointName: string, distance: number): void {
    try {
      const notification = new Notification('🎯 Checkpoint Reached!', {
        body: `You have reached ${checkpointName}!\nDistance: ${Math.round(distance)}m`,
        icon: 'assets/images/marker-green.svg',
        badge: 'assets/images/marker-green.svg',
        tag: `checkpoint-${checkpointName}`,
        requireInteraction: false,
        silent: false
      });

      // Auto-close notification after 5 seconds
      setTimeout(() => notification.close(), 5000);
      console.log('✅ Fallback notification sent');
    } catch (error) {
      console.error('❌ Failed to create notification:', error);
    }
  }

  private playNotificationSound(): void {
    try {
      // Create a simple beep sound using Web Audio API
      if ('AudioContext' in window || 'webkitAudioContext' in window) {
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.notificationAudioContext = this.notificationAudioContext || new AudioContext();
        const audioContext = this.notificationAudioContext;

        if (audioContext.state === 'suspended') {
          audioContext.resume?.();
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      }
    } catch (error) {
      console.log('Audio playback not available:', error);
    }
  }

  private showVisualAlert(checkpointName: string, distance: number): void {
    const alert = document.createElement('div');
    alert.className = 'checkpoint-alert';
    alert.innerHTML = `
      <div class="alert-content">
        <div class="alert-icon">🎯</div>
        <div class="alert-text">
          <strong>Checkpoint Reached!</strong>
          <p>${checkpointName}</p>
          <small>Distance: ${Math.round(distance)}m</small>
        </div>
      </div>
    `;

    document.body.appendChild(alert);

    // Animate in
    setTimeout(() => alert.classList.add('show'), 10);

    // Remove after 4 seconds
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => document.body.removeChild(alert), 300);
    }, 4000);
  }

  private startLocationTracking(): void {
    // Tracking is handled by LocationTrackingService to persist across navigation/refresh.
    // This method is intentionally kept as a no-op for backward compatibility.
  }


  // ---- "me" marker: the explorer --------------------------------------------------------
  //
  // An adventure-game player character for the forest-bathing walk: a chibi explorer with a
  // leaf in the hat band, a bedroll backpack, a walking stick and a scarf that flutters.
  // Around it: a bobbing gold "player" arrow, a slowly turning rune ring at the feet, a cone
  // for the exact bearing, leaves kicked up while walking, footprints left behind, and a
  // "deep breath" 🍃 bubble when the visitor pauses — the point of forest bathing.
  //
  // Built once as a divIcon and only restyled afterwards (class toggles + one CSS variable):
  // rebuilding it per fix restarted every animation. Styles: styles.scss, `.me-marker`.

  /** Last known travel direction in degrees (0 = north), or null before any movement. */
  private walkerHeading: number | null = null;
  private walkerStopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Footprint markers still on the map, oldest first. */
  private footprints: { marker: any; timer: ReturnType<typeof setTimeout> }[] = [];

  private createWalkerIcon(): any {
    return L.divIcon({
      className: 'me-marker',
      iconSize: [64, 84],
      iconAnchor: [32, 74],
      popupAnchor: [0, -66],
      html: `
        <span class="me-ring"><i></i></span>
        <svg class="me-cone" viewBox="0 0 80 80" aria-hidden="true">
          <defs><radialGradient id="meCone" cx="50%" cy="100%" r="100%">
            <stop offset="0" stop-color="#f3cc62" stop-opacity=".7"/>
            <stop offset="1" stop-color="#f3cc62" stop-opacity="0"/>
          </radialGradient></defs>
          <path d="M40 40 L20 4 A40 40 0 0 1 60 4 Z" fill="url(#meCone)"/>
        </svg>
        <span class="me-fx">
          <i class="me-leaf"></i><i class="me-leaf"></i><i class="me-leaf"></i>
        </span>
        <span class="me-figure">
          <svg viewBox="0 0 48 60" aria-hidden="true">
            <g class="me-bob">
              <g class="me-leg me-leg-back">
                <path class="me-pants" d="M22 43 L21 53"/>
                <rect class="me-boot" x="17.5" y="52" width="7.5" height="4.5" rx="2"/>
              </g>
              <path class="me-arm me-arm-back" d="M23 32 L19 39"/>
              <rect class="me-bedroll" x="8.5" y="23" width="13.5" height="5.5" rx="2.75"/>
              <rect class="me-pack" x="10" y="27.5" width="11" height="15" rx="3.2"/>
              <rect class="me-pocket" x="11.5" y="34" width="6" height="5" rx="1.4"/>
              <rect class="me-torso" x="18" y="29" width="13" height="15" rx="5"/>
              <path class="me-strap" d="M21 29.5 L27 43"/>
              <path class="me-belt" d="M18.4 40.5 h12.2"/>
              <g class="me-scarf">
                <path d="M22.5 29.5 L12.5 32 L15.5 35.5 Z"/>
                <rect x="21" y="27.5" width="10" height="3.6" rx="1.8"/>
              </g>
              <g class="me-leg me-leg-front">
                <path class="me-pants" d="M27 43 L28 53"/>
                <rect class="me-boot" x="25.5" y="52" width="7.5" height="4.5" rx="2"/>
              </g>
              <path class="me-hair" d="M17 15 q-1 9 6 11 q-5 -6 -2 -12 Z"/>
              <circle class="me-head" cx="26" cy="18" r="9.5"/>
              <circle class="me-ear" cx="22" cy="19" r="2"/>
              <ellipse class="me-eye" cx="31" cy="17.5" rx="1.3" ry="1.9"/>
              <circle class="me-blush" cx="30" cy="21.8" r="1.8"/>
              <path class="me-smile" d="M31.5 23 q1.2 .8 2.2 -.4"/>
              <path class="me-crown" d="M17.5 11.5 Q18 2.5 26 2.5 Q34 2.5 34.5 11.5 Z"/>
              <path class="me-band" d="M17.7 9.6 H34.3"/>
              <path class="me-hatleaf" d="M19 9 q1 -6 7 -7 q-1 6 -7 7 Z"/>
              <ellipse class="me-brim" cx="26" cy="11.6" rx="14" ry="2.8"/>
              <g class="me-arm me-arm-front">
                <path class="me-stick" d="M34.6 33.5 L37 57"/>
                <circle class="me-knob" cx="34.5" cy="33" r="1.5"/>
                <path class="me-sleeve" d="M28 32 L33 38.5"/>
                <circle class="me-hand" cx="33.6" cy="38.6" r="1.9"/>
              </g>
            </g>
          </svg>
        </span>
        <span class="me-arrow"></span>
        <span class="me-emote">🍃</span>`,
    });
  }

  /** Compass bearing from one point to another, in degrees (0 = north, 90 = east). */
  private bearingDeg(from: [number, number], to: [number, number]): number {
    const r = Math.PI / 180;
    const [lat1, lat2] = [from[0] * r, to[0] * r];
    const dLng = (to[1] - from[1]) * r;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) / r + 360) % 360;
  }

  /** Point the explorer and make it walk; after a pause it stops and takes a breath. */
  private applyWalkerState(walking: boolean): void {
    const el: HTMLElement | null = this.userMarker?.getElement?.() ?? null;
    if (!el) return;

    const h = this.walkerHeading;
    el.classList.toggle('has-heading', h !== null);
    // West-bound (180–360°) mirrors the side-view figure; the cone shows the exact bearing.
    el.classList.toggle('face-left', h !== null && h > 180 && h < 360);
    if (h !== null) el.style.setProperty('--me-heading', `${h}deg`);
    el.classList.toggle('is-walking', walking);
    el.classList.toggle('is-resting', !walking);

    if (this.walkerStopTimer) clearTimeout(this.walkerStopTimer);
    this.walkerStopTimer = null;
    if (walking) {
      // No fix beyond the GPS-wobble deadband for a while → the visitor has stopped.
      this.walkerStopTimer = setTimeout(() => this.applyWalkerState(false), 6000);
    }
  }

  /** Leave a fading footprint where the explorer just was, pointing the way it went. */
  private dropFootprint(at: [number, number], heading: number | null): void {
    if (!this.map) return;
    const marker = L.marker(at, {
      icon: L.divIcon({
        className: 'me-step',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        html: `<span style="transform: rotate(${heading ?? 0}deg)"><i></i><i></i></span>`,
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -500,
    }).addTo(this.map);

    const timer = setTimeout(() => {
      marker.remove();
      this.footprints = this.footprints.filter(f => f.marker !== marker);
    }, 9000);
    this.footprints.push({ marker, timer });

    // A short trail is enough; the green path line already shows the whole route.
    while (this.footprints.length > 14) {
      const old = this.footprints.shift()!;
      clearTimeout(old.timer);
      old.marker.remove();
    }
  }

  private clearFootprints(): void {
    for (const f of this.footprints) {
      clearTimeout(f.timer);
      f.marker.remove();
    }
    this.footprints = [];
  }

  private updateUserLocation(latitude: number, longitude: number): void {
    const latlng: [number, number] = [latitude, longitude];
    // Avoid per-update logging; it can noticeably slow down mobile browsers.

    // Keep the latest user location for manual re-centering
    this.userLatLng.set(latlng);

    if (this.map) { // Ensure map is initialized
      // Get heading from the last tracked point
      const lastPoint = this.locationTracking.lastPoint();
      const heading = lastPoint?.heading ?? null; // ?? not ||: 0° (due north) is a real heading

      // Update user marker
      if (this.userMarker) {
        // Stationary deadband: if the new fix is within the accuracy-scaled deadband of
        // where the marker already sits, the user hasn't really moved (just GPS wobble).
        // Keep the marker — and its facing icon — frozen so it doesn't drift while
        // standing still.
        const anchor = this.lastMarkerLatLng;
        const movedM = anchor
          ? this.calculateDistance(anchor[0], anchor[1], latitude, longitude) * 1000
          : Infinity;

        if (movedM >= this.moveDeadbandM(lastPoint?.accuracy)) {
          // Direction: the device's own heading when it is moving and reports one (it is
          // null or NaN on many phones at walking pace), otherwise the bearing we just walked.
          const speed = lastPoint?.speed ?? null;
          const gpsHeading = typeof heading === 'number' && Number.isFinite(heading) && speed !== null && speed > 0.4
            ? heading : null;
          this.walkerHeading = gpsHeading ?? (anchor ? this.bearingDeg(anchor, latlng) : this.walkerHeading);

          if (anchor) this.dropFootprint(anchor, this.walkerHeading);
          this.userMarker.setLatLng(latlng);
          this.lastMarkerLatLng = latlng;
          this.applyWalkerState(true);
        }
      } else {
        this.userMarker = L.marker(latlng, { icon: this.createWalkerIcon(), zIndexOffset: 1000, keyboard: false })
          .addTo(this.map)
          .bindPopup(`You are here. ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        this.lastMarkerLatLng = latlng;
        this.applyWalkerState(false);
      }

      // Initialize checkpoints only once the user location is available
      if (!this.checkpointCircles.length) {
        this.initializeCheckpoints();
      }

      // Center map only on the very first GPS fix.
      // After the user pans/zooms, we do NOT auto-recenter; use the "Center on me" button instead.
      if (!this.hasAutoCenteredOnUser) {
        this.map.setView(latlng, 17);
        this.hasAutoCenteredOnUser = true;
      }
    }
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private isValidLatLngTuple(value: unknown): value is [number, number] {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      this.isFiniteNumber(value[0]) &&
      this.isFiniteNumber(value[1])
    );
  }

  private toLatLngTuple(value: any): [number, number] | null {
    if (this.isValidLatLngTuple(value)) return [value[0], value[1]];

    if (value && typeof value === 'object') {
      const lat = value.lat ?? value.latitude;
      const lng = value.lng ?? value.lon ?? value.long ?? value.longitude;
      if (this.isFiniteNumber(lat) && this.isFiniteNumber(lng)) return [lat, lng];
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) return [latNum, lngNum];
    }

    return null;
  }

  private sanitizePath(raw: unknown): [number, number][] {
    if (!Array.isArray(raw)) return [];
    const out: [number, number][] = [];
    for (const item of raw) {
      const tuple = this.toLatLngTuple(item);
      if (tuple) out.push(tuple);
    }
    return out;
  }

  private ensureValidPath(path: [number, number][]): [number, number][] {
    // Fast path: if everything is valid, return original reference.
    for (const p of path) {
      if (!this.isValidLatLngTuple(p)) {
        return path.filter(pt => this.isValidLatLngTuple(pt));
      }
    }
    return path;
  }

  private isCheckpointCompleted(id: number): boolean {
    const cp: any = this.checkpoints().find(c => c.id === id);
    if (!cp) return false;
    // "Completed" means the checkpoint has evidence/answer saved (not just radius-entered).
    return !!(cp.reached && (cp.answer || cp.photo || cp.question || cp.shareLink));
  }

  private isCheckpoint17Unlocked(): boolean {
    return this.isMission16CompletedForRoute();
  }

  private isMission16CompletedForRoute(): boolean {
    if (this.isCheckpointCompleted(16)) return true;

    const saved = this.storage.getMissions();
    const cp16 = saved?.find((cp: any) => cp?.id === 16);
    if (!cp16) return false;

    return !!(cp16.reached && (cp16.answer || cp16.photo || cp16.shareLink));
  }

  private getDefaultRouteAssetUrl(): string {
    return this.isMission16CompletedForRoute()
      ? this.returnRouteAssetUrl
      : this.defaultRouteAssetUrl;
  }


  private initializeCheckpoints(): void {
    if (!this.map) return;

    // Create a custom pane for checkpoint circles to ensure they're visible
    if (!this.map.getPane('checkpointPane')) {
      const pane = this.map.createPane('checkpointPane');
      pane.style.zIndex = '400'; // Above tiles (200) but below markers (600)
    }

    // Create a custom pane for checkpoint markers so they always sit above polylines
    // (both guide/custom paths are vector layers and can otherwise overlap markers).
    if (!this.map.getPane('checkpointMarkerPane')) {
      const pane = this.map.createPane('checkpointMarkerPane');
      pane.style.zIndex = '650';
    }

    // Clear existing circles and markers before re-initialization
    this.checkpointCircles.forEach(c => c?.remove?.());
    this.checkpointCircles = [];

    this.checkpointMarkers.forEach(m => m?.remove?.());
    this.checkpointMarkers = [];

    // Load custom path if exists
    this.loadCustomPath();

    // Render previously drawn path if it exists
    if (this.customPath().length >= 2) {
      this.updateCustomPathPolyline();
    }

    const showCheckpoint17 = this.isCheckpoint17Unlocked();

    this.checkpoints().forEach((checkpoint) => {
      // If checkpoint 17 is locked, do not render it on the map.
      // IMPORTANT: keep array indices aligned with checkpoint.id for existing code paths.
      if (checkpoint.id === 17 && !showCheckpoint17) {
        this.checkpointMarkers[checkpoint.id - 1] = null;
        this.checkpointCircles[checkpoint.id - 1] = null;
        return;
      }

      if (!this.isFiniteNumber(checkpoint.lat) || !this.isFiniteNumber(checkpoint.lng)) {
        console.warn('Skipping checkpoint with invalid coordinates:', checkpoint);
        return;
      }

      const latlng = new L.LatLng(checkpoint.lat, checkpoint.lng);

      // L.marker + DivIcon is DOM-heavy and can lag on mobile when panning/zooming.
      // Use a Canvas-rendered circle marker and a minimal tooltip for the number.
      const marker = L.circleMarker(latlng, {
        radius: 10,
        color: checkpoint.reached ? '#1f6b3a' : '#1f6b3a',
        weight: 2,
        fillColor: checkpoint.reached ? '#2f8f4e' : '#2f8f4e',
        fillOpacity: 1,
        renderer: this.vectorRenderer || undefined,
        pane: 'checkpointMarkerPane'
      })
        .addTo(this.map)
        .bindTooltip(String(checkpoint.id), {
          permanent: true,
          direction: 'center',
          className: 'checkpoint-number-tooltip',
          opacity: 1
        })
        .bindPopup(`<strong>${checkpoint.id}. ${checkpoint.name}</strong><br><em>${checkpoint.mission}</em>`);

      // Tag the marker so we can control z-order for specific checkpoints.
      (marker as any).__checkpointId = checkpoint.id;

      this.checkpointMarkers[checkpoint.id - 1] = marker;

      // CIRCLE with explicit SVG renderer for iOS compatibility
      const circle = L.circle(latlng, {
        radius: checkpoint.radius,
        color: checkpoint.reached ? 'green' : 'red',
        fillColor: checkpoint.reached ? '#0f3' : '#f03',
        fillOpacity: 0.5,
        weight: 2,
        opacity: 0.8,
        renderer: this.vectorRenderer || undefined,
        interactive: false,
        pane: 'checkpointPane' // Use custom pane for better layering
      }).addTo(this.map);

      this.checkpointCircles[checkpoint.id - 1] = circle;
    });

    // When zoomed out, checkpoints can visually overlap.
    // Ensure checkpoint 1 is always on top of others (e.g., checkpoint 17).
    const checkpoint1Marker = this.checkpointMarkers.find(m => !!m && (m as any).__checkpointId === 1);
    if (checkpoint1Marker && typeof checkpoint1Marker.bringToFront === 'function') {
      checkpoint1Marker.bringToFront();
    }
  }

 private checkCheckpointProximity(latitude: number, longitude: number): void {

  if (!this.map) return;

  if (!this.isFiniteNumber(latitude) || !this.isFiniteNumber(longitude)) return;

  const userPos = new L.LatLng(latitude, longitude);
  let isInAnyRadius = false;
  let activeId: number | null = null;

  const showCheckpoint17 = this.isCheckpoint17Unlocked();

  for (const checkpoint of this.checkpoints()) {
    // If checkpoint 17 is locked, ignore it entirely (no popup, no mission navigation).
    if (checkpoint.id === 17 && !showCheckpoint17) continue;

    if (!this.isFiniteNumber(checkpoint.lat) || !this.isFiniteNumber(checkpoint.lng)) continue;
    const checkpointPos = new L.LatLng(checkpoint.lat, checkpoint.lng);
    const distance = userPos.distanceTo(checkpointPos);

    this.checkDistanceTo = distance;

    // Check if user is in any checkpoint radius
    if (distance <= checkpoint.radius) {
      isInAnyRadius = true;
      activeId = checkpoint.id;

      // If the checkpoint hasn't been reached yet
      if (!checkpoint.reached) {
        const now = Date.now();
        if (this.lastRadiusTrigger?.id === checkpoint.id && now - this.lastRadiusTrigger.at < 8000) {
          break;
        }
        this.lastRadiusTrigger = { id: checkpoint.id, at: now };

        // Checkpoint 17 gating is handled above by hiding/ignoring it until checkpoint 16 is completed.

        // Set start time the first time any mission is reached
        if (!this.storage.getStartTime()) {
          this.storage.setStartTime(new Date().toISOString());
        }
        this.selectedCheckpoint.set(checkpoint);
        this.showDialog.set(true);

        // Persist reached immediately (avoid repeated triggering if checkpoints are re-synced)
        this.checkpoints.update(list => {
          const updated = list.map(cp => cp.id === checkpoint.id ? { ...cp, reached: true } : cp);
          this.storage.setMissions(updated);
          return updated;
        });

        // Play audio only if sound is enabled
        if (this.appState.soundEnabled()) {
          console.log(`🔊 Sound enabled - attempting to play audio for checkpoint ${checkpoint.id}`);
          const audioUrl = this.audio.getRandomCheckpointSoundtrackPath();
          this.audio.playCheckpointAudio(checkpoint.id, audioUrl);
        } else {
          console.log(`🔇 Sound disabled - skipping audio playback`);
        }

        // Play checkpoint soundtrack
        // const audioPath = `/assets/audio/checkpoint-soundtrack.mp3`;
        // this.audio.playCheckpointAudio(checkpoint.id, audioPath);


        this.showNotification(checkpoint.name, distance);

        // Immediately navigate to missions page when entering radius
        if (!this.isNavigatingToMissions) {
          this.isNavigatingToMissions = true;
          // Ensure mission page can resolve the active checkpoint
          this.navigationService.setInRadius(true);
          this.navigationService.setCurrentCheckpointId(checkpoint.id);
          this.router.navigate(['/missions']).finally(() => {
            this.isNavigatingToMissions = false;
          });
        }
      }
      break;
    }
  }

  // Update the navigation service with radius status
  if (!this.isNavigatingToMissions) {
    this.navigationService.setInRadius(isInAnyRadius);
    this.navigationService.setCurrentCheckpointId(activeId);
  }

  // Stop audio when exiting checkpoint radius
  if (this.lastInRadius && !isInAnyRadius) {
    console.log('📍 User exited checkpoint radius - stopping audio');
    this.audio.stopAudio();
  }
  this.lastInRadius = isInAnyRadius;
}


  // Create a curved path between two points with natural-looking variations
  private createCurvedPath(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
    numPoints: number
  ): [number, number][] {
    const points: [number, number][] = [];
    points.push([lat1, lng1]);

    const latDiff = lat2 - lat1;
    const lngDiff = lng2 - lng1;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    // Add slight perpendicular offset for natural curve
    const perpLat = -lngDiff * 0.2; // Perpendicular direction (increased for more curve)
    const perpLng = latDiff * 0.2;

    for (let i = 1; i < numPoints; i++) {
      const t = i / numPoints;

      // Combine multiple sine waves for more natural variation
      const curve1 = Math.sin(t * Math.PI) * 0.4; // Main curve
      const curve2 = Math.sin(t * Math.PI * 3) * 0.1; // Small wiggles
      const curveOffset = curve1 + curve2;

      const lat = lat1 + latDiff * t + perpLat * curveOffset;
      const lng = lng1 + lngDiff * t + perpLng * curveOffset;

      // Add GPS-like random variation (scaled by distance)
      const variation = distance * 50; // Scale variation with distance
      const randomLat = (Math.random() - 0.5) * 0.00015 * variation;
      const randomLng = (Math.random() - 0.5) * 0.00015 * variation;

      points.push([lat + randomLat, lng + randomLng]);
    }

    points.push([lat2, lng2]);
    return points;
  }


  private initMap(): void {
    if (this.destroyed) return;

    // Guard + cleanup in case Angular reuses the DOM node or init runs twice.
    if (this.map) {
      try { this.map.remove(); } catch {}
      this.map = null;
    }
    this.resetLeafletContainer('map');

    // Use the first checkpoint's location as a fallback center
    const defaultCenter: [number, number] = [
      this.checkpoints()[0]?.lat || 7.55,
      this.checkpoints()[0]?.lng || 99.77
    ];

      // Canvas renderer is significantly smoother on mobile than many SVG layers.
      this.vectorRenderer = L.canvas({ padding: 0.5 });

    const isMobile = !!L?.Browser?.mobile;

    this.map = L.map('map', {
      center: defaultCenter,
      zoom: 15,
      minZoom: 2,
      // Allow users to zoom in further; tiles will be scaled past maxNativeZoom.
      maxZoom: 22,
        // Prefer Canvas for smoother pan/zoom on mobile
        preferCanvas: true,
      renderer: this.vectorRenderer,
      // Animations can feel choppy on mid/low-end mobile devices
      zoomAnimation: !isMobile,
      fadeAnimation: !isMobile,
      markerZoomAnimation: !isMobile
    });

    // The walker glides between fixes with a CSS transition on its transform. Leaflet also
    // moves markers by transform when zooming, so switch the glide off for the zoom itself,
    // otherwise the figure visibly slides into place after every pinch.
    const container: HTMLElement = this.map.getContainer();
    this.map.on('zoomstart', () => container.classList.add('me-no-glide'));
    this.map.on('zoomend', () => requestAnimationFrame(() => requestAnimationFrame(
      () => container.classList.remove('me-no-glide'))));

    // While a finger is dragging or pinching the map, freeze every decorative animation
    // (explorer, footprints, backdrop). The phone's whole frame budget then goes to moving
    // tiles, which is what makes a drag feel smooth on a mid-range device.
    const root = document.documentElement;
    this.map.on('movestart zoomstart', () => root.classList.add('map-moving'));
    this.map.on('moveend zoomend', () => root.classList.remove('map-moving'));

    this.streetTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      // OSM tiles are available up to z=19; beyond that Leaflet scales tiles.
      maxNativeZoom: 19,
      maxZoom: 22,
      minZoom: 2,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        // Reduce tile redraw work during pinch-zoom on mobile
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 2,
        // CORS (OSM sends Access-Control-Allow-Origin: *) so the service worker can keep
        // tiles already seen: an opaque no-cors response counts as ~7 MB against the storage
        // quota and would fill it after a handful of tiles. See ngsw-config.json "map-tiles".
        crossOrigin: 'anonymous'
    });

    this.satelliteTiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        // Some areas/providers stop serving imagery at very high zoom levels.
        // Scale tiles past this to avoid placeholder tiles like "map data not yet available".
        maxNativeZoom: 18,
        maxZoom: 22,
        minZoom: 2,
        attribution: 'Tiles &copy; Esri',
        updateWhenZooming: false,
        updateWhenIdle: true,
        crossOrigin: 'anonymous'
      }
    );

    this.streetTiles.addTo(this.map);

    // Add a custom location control button using Leaflet's built-in controls.
    // We can use the Locate Control plugin, which is now loaded.
    L.control.locate({
      position: 'topright',
      setView: 'untilPan', // set view to a higher zoom level after a location found
      flyTo: true,
      drawCircle: false,
      markerStyle: {
        fillColor: '#2f8f4e', // blue-500
        color: '#14532d',    // blue-800
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7
      },
      strings: {
        title: "Show my location"
      },
      locateOptions: {
        enableHighAccuracy: true,
        maxZoom: 17,
        timeout: 5000,
        maximumAge: 0
      }
    }).addTo(this.map);

    // Remove the custom location control implementation you had before as we now use the plugin
    // L.Control implementation removed here...
  }

  toggleSatellite(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.map) return;
    if (!this.streetTiles || !this.satelliteTiles) return;

    const next = !this.isSatellite();

    if (next) {
      if (this.map.hasLayer(this.streetTiles)) this.map.removeLayer(this.streetTiles);
      if (!this.map.hasLayer(this.satelliteTiles)) this.satelliteTiles.addTo(this.map);
    } else {
      if (this.map.hasLayer(this.satelliteTiles)) this.map.removeLayer(this.satelliteTiles);
      if (!this.map.hasLayer(this.streetTiles)) this.streetTiles.addTo(this.map);
    }

    this.isSatellite.set(next);
  }

  completeMission(): void {
    const checkpoint = this.selectedCheckpoint();
    if (!checkpoint || !checkpoint.answer) return;

    // Update the specific checkpoint in the signal array immutably
    this.checkpoints.update(checkpoints =>
      checkpoints.map(c =>
        c.id === checkpoint.id ? { ...c, reached: true, answer: checkpoint.answer } : c
      )
    );

    // Save to storage
    this.storage.setMissions(this.checkpoints());

    // Close dialog and clear selection
    this.showDialog.set(false);
    this.selectedCheckpoint.set(null);

    // Update the circle color visually
    const index = checkpoint.id - 1;
    if (this.checkpointCircles[index]) {
      this.checkpointCircles[index].setStyle({
        color: 'green',
        fillColor: '#0f3',
        fillOpacity: 0
      });
    }

    // Check for game completion
    if (this.checkpoints().every(c => c.reached)) {
      // Record end time when all missions are completed
      if (!this.storage.getCompletedAt()) {
        this.storage.setCompletedAt(new Date().toISOString());
      }
      // Use a custom alert message instead of window.alert()
      this.displayCustomMessage("🎉 Congratulations!", "You've completed all missions!");
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const cp = this.selectedCheckpoint();
    const filename = cp
      ? `botany_checkpoint_${cp.id}_photo_${Date.now()}`
      : `botany_photo_${Date.now()}`;

    // Best-effort: save to the user's device (mobile only) + notify user.
    this.imageUploadService
      .savePhotoToDevice(file, { filename, onlyOnMobile: true })
      .then((status) => {
        if (status === 'skipped' || status === 'cancelled') return;

        let title = this.t.map.photoSavedTitle;
        let message = this.t.map.photoSavedMsg;

        if (status === 'shared') {
          title = this.t.map.photoSaveHelpTitle;
          message = this.t.map.photoSaveHelpMsgShare;
        } else if (status === 'opened') {
          title = this.t.map.photoSaveHelpTitle;
          message = this.t.map.photoSaveHelpMsgIOS;
        }

        this.displayCustomMessage(title, message);
      })
      .catch(() => void 0);

    const reader = new FileReader();

    reader.onload = () => {
      const photoDataUrl = reader.result as string;
      this.selectedCheckpoint.update(cp => cp ? { ...cp, photo: photoDataUrl } : null);
    };

    reader.readAsDataURL(file);

    // Allow selecting the same file again.
    input.value = '';
  }

  // Custom message box logic (replaces window.alert)
  displayCustomMessage(title: string, message: string): void {
    const container = document.createElement('div');
    container.setAttribute(
      'style',
      'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:50;display:flex;' +
      'align-items:center;justify-content:center;padding:16px;'
    );

    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;box-shadow:0 20px 45px rgba(0,0,0,.35);
                  padding:24px;width:100%;max-width:24rem;text-align:center;">
        <h3 style="font-size:20px;font-weight:700;color:#14532d;font-family:var(--f-head);font-weight:600;margin:0 0 12px;">${title}</h3>
        <p style="color:#2a3d31;margin:0 0 24px;">${message}</p>
        <button id="close-message"
                style="padding:10px 20px;background:#1f6b3a;border-radius:999px;color:#fff;font-weight:600;
                       border:none;padding:10px 28px;font-size:15px;min-height:44px;cursor:pointer;">
          OK
        </button>
      </div>
    `;

    document.body.appendChild(container);

    const closeButton = document.getElementById('close-message');
    closeButton?.addEventListener('click', () => {
      document.body.removeChild(container);
    });
  }

  // Test notification system
  async testNotification(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      alert('Notifications not available in SSR mode');
      return;
    }

    let diagnostics = '📱 Notification Test Results:\n\n';

    // Check if Notification API is available
    if (!('Notification' in window)) {
      alert('❌ Notifications not supported in this browser.\n\nYour browser does not support the Notification API.');
      return;
    }
    diagnostics += '✅ Notification API: Supported\n';

    // Check current permission status
    const currentPermission = Notification.permission;
    diagnostics += `📋 Current Permission: ${currentPermission}\n`;

    // Request permission if not already granted
    if (currentPermission === 'default') {
      diagnostics += '🔔 Requesting permission...\n';
      await this.requestNotificationPermission();
    }

    // Check vibration support
    if ('vibrate' in navigator) {
      diagnostics += '✅ Vibration: Supported\n';
    } else {
      diagnostics += '❌ Vibration: Not supported\n';
    }

    // Check audio context support
    if ('AudioContext' in window || 'webkitAudioContext' in window) {
      diagnostics += '✅ Audio: Supported\n';
    } else {
      diagnostics += '❌ Audio: Not supported\n';
    }

    if (this.notificationPermission) {
      diagnostics += '\n🎯 Sending test notification...\n';

      // Test with sample checkpoint data
      this.showNotification('Test Checkpoint 🧪', 25);

      diagnostics += '✅ All notification features triggered!\n';
      diagnostics += '\nYou should see/feel:\n';
      diagnostics += '• Push notification\n';
      diagnostics += '• Phone vibration\n';
      diagnostics += '• Sound beep\n';
      diagnostics += '• Visual alert (green box)\n';

      console.log('✅ Notification test triggered!');
      console.log(diagnostics);

      // Show success message
      setTimeout(() => {
        alert(diagnostics);
      }, 500);
    } else {
      diagnostics += '\n❌ Permission Status: DENIED\n\n';
      diagnostics += 'To enable notifications:\n';
      diagnostics += '1. Click the lock/info icon in address bar\n';
      diagnostics += '2. Find "Notifications" setting\n';
      diagnostics += '3. Change to "Allow"\n';
      diagnostics += '4. Refresh the page\n';

      console.log('❌ Permission denied:', diagnostics);
      alert(diagnostics);
    }
  }

  // Check service worker status - useful for mobile debugging
  async checkServiceWorkerStatus(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      alert('Not available in SSR mode');
      return;
    }

    let status = '⚙️ Service Worker Status:\n\n';

    // Check if Service Worker is supported
    if (!('serviceWorker' in navigator)) {
      alert('❌ Service Workers are NOT supported in this browser.\n\nNotifications may not appear in notification tray.');
      return;
    }
    status += '✅ Service Worker API: Supported\n';

    // Check if we're on HTTPS or localhost
    const isSecureContext = window.isSecureContext ||
                           window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';

    status += `🔒 Protocol: ${window.location.protocol}\n`;
    status += `📍 Host: ${window.location.hostname}\n`;

    if (!isSecureContext) {
      status += '\n❌ SECURITY ISSUE:\n';
      status += 'Service Workers require HTTPS!\n\n';
      status += '⚠️ You are accessing via HTTP\n';
      status += `(${window.location.origin})\n\n`;
      status += '📱 Solutions:\n';
      status += '1. Access via: https://localhost:4200\n';
      status += '   (You\'ll need SSL certificate)\n';
      status += '2. Or use: http://localhost:4200\n';
      status += '   (on the same device)\n';
      status += '3. Deploy to HTTPS server\n\n';
      status += '⚠️ Current notifications:\n';
      status += '• Visual alerts: ✅ Work\n';
      status += '• Vibration: ✅ Works\n';
      status += '• Sound: ✅ Works\n';
      status += '• Push notifications: ❌ Won\'t work\n';
      status += '  (requires HTTPS)\n';

      alert(status);
      return;
    }

    status += '✅ Secure Context: Yes\n\n';

    try {
      // Get all registrations
      const registrations = await navigator.serviceWorker.getRegistrations();
      status += `📋 Registered Workers: ${registrations.length}\n\n`;

      if (registrations.length > 0) {
        registrations.forEach((reg, index) => {
          status += `Worker ${index + 1}:\n`;
          status += `• Scope: ${reg.scope}\n`;
          status += `• State: ${reg.active?.state || 'inactive'}\n`;
          status += `• Installing: ${reg.installing ? 'Yes' : 'No'}\n`;
          status += `• Waiting: ${reg.waiting ? 'Yes' : 'No'}\n`;
          status += `• Active: ${reg.active ? 'Yes' : 'No'}\n\n`;
        });

        // Check if our specific SW is registered
        const ourSW = registrations.find(reg => reg.scope.includes(window.location.origin));
        if (ourSW) {
          status += '✅ Notification Service Worker: ACTIVE\n';
          status += '✅ Push notifications should work!\n';
        } else {
          status += '⚠️ Notification SW not found\n';
        }
      } else {
        status += '❌ No Service Workers registered!\n\n';
        status += 'Trying to register now...\n';

        // Try to register
        await this.registerServiceWorker();

        if (this.serviceWorkerRegistration) {
          status += '✅ Service Worker registered successfully!\n';
          status += 'Please test notifications again.\n';
        } else {
          status += '❌ Failed to register Service Worker\n';
          status += 'Check console for errors.\n';
        }
      }

      // Check current controller
      if (navigator.serviceWorker.controller) {
        status += '\n✅ Page is controlled by Service Worker\n';
        status += `Script: ${navigator.serviceWorker.controller.scriptURL}\n`;
      } else {
        status += '\n⚠️ Page NOT controlled by Service Worker\n';
        status += 'Try refreshing the page.\n';
      }

      console.log(status);
      alert(status);
    } catch (error) {
      status += `\n❌ Error checking status: ${error}\n`;
      console.error('Service Worker status error:', error);
      alert(status);
    }
  }

  // Reset all checkpoint data to initial values
  resetCheckpoints(): void {
    if (confirm('⚠️ Reset all checkpoint data to initial values? This will clear all progress!')) {
      // Clear all related data
      this.storage.clearAllAppData();

      // Clear all question indices
      for (let i = 1; i <= 20; i++) {
        localStorage.removeItem(`qIdx_${i}`);
      }

      // Reset checkpoints to initial data
      this.checkpoints.set(INITIAL_CHECKPOINTS);
      localStorage.setItem('missions', JSON.stringify(INITIAL_CHECKPOINTS));

      // Reset stars earned
      this.starsEarned.set(0);
      this.readMoreClicked.set(new Set());

      // Reinitialize the map markers and circles
      if (this.checkpointCircles.length) {
        this.checkpointCircles.forEach(c => c?.remove?.());
        this.checkpointCircles = [];
        this.initializeCheckpoints();
      }

      alert('✅ All checkpoint data has been reset!');

      // Reload the page to ensure everything is fresh
      window.location.reload();
    }
  }

  // Start GPS path tracking
  startTracking(): void {
    // Start the timer at the press of Start (not at the first checkpoint), so duration and
    // steps cover the whole walk. Guarded so a resumed session keeps its original start.
    if (!this.storage.getStartTime()) {
      this.storage.setStartTime(new Date().toISOString());
    }
    // This runs from a tap, which is the only context iOS will show either prompt in.
    void this.requestNotificationPermission();
    this.locationTracking.start();
    console.log('🟢 GPS tracking started (persistent)');
  }

  // Stop GPS path tracking
  stopTracking(): void {
    this.locationTracking.stop();
    console.log('🔴 GPS tracking stopped (persistent)');
    console.log('Total points tracked:', this.userPath().reduce((n, s) => n + s.length, 0));
  }

  // Deadband radius for "has the user really moved": at least MIN_MOVE_DEADBAND_M,
  // scaled up when the GPS reports poor accuracy so noisy fixes don't jitter the visuals.
  private moveDeadbandM(...accuracies: Array<number | null | undefined>): number {
    let worst = 0;
    for (const a of accuracies) {
      if (typeof a === 'number' && Number.isFinite(a) && a > worst) worst = a;
    }
    return Math.max(this.MIN_MOVE_DEADBAND_M, worst * this.ACCURACY_DEADBAND_FACTOR);
  }

  // Decide whether a raw GPS fix should extend the drawn trail, start a new segment
  // (after a background gap), or be dropped as a spike. Mutates `segments` and the
  // tracking anchors; returns true if the drawn trail changed. This affects ONLY the
  // rendered line — checkpoint detection always uses the raw points from the service.
  private pushTrailPoint(segments: [number, number][][], p: TrackedPoint): boolean {
    if (!this.isFiniteNumber(p?.lat) || !this.isFiniteNumber(p?.lng)) return false;

    const prev = this.lastTrailPoint;
    if (!prev) {
      segments.push([[p.lat, p.lng]]);
      this.lastTrailPoint = { lat: p.lat, lng: p.lng, t: p.timestamp, acc: p.accuracy };
      this.consecutiveTrailSpikes = 0;
      return true;
    }

    const dtMs = p.timestamp - prev.t;
    const distKm = this.calculateDistance(prev.lat, prev.lng, p.lat, p.lng);
    const distM = distKm * 1000;

    // Long gap (app backgrounded / screen locked): start a new segment so the two
    // fixes aren't bridged with a misleading straight line.
    if (dtMs > this.TRAIL_GAP_MS) {
      segments.push([[p.lat, p.lng]]);
      this.lastTrailPoint = { lat: p.lat, lng: p.lng, t: p.timestamp, acc: p.accuracy };
      this.consecutiveTrailSpikes = 0;
      return true;
    }

    // Stationary deadband: GPS wobble while standing still would otherwise pile up into
    // a jagged blob on the trail. Keep the anchor and drop the fix until the user has
    // actually moved past the accuracy-scaled deadband.
    if (distM < this.moveDeadbandM(prev.acc, p.accuracy)) {
      this.consecutiveTrailSpikes = 0;
      return false;
    }

    // Implausibly fast jump over a short interval = GPS spike.
    if (distM >= this.TRAIL_MIN_SPIKE_M) {
      const dtH = dtMs / 3_600_000;
      const speedKmh = dtH > 0 ? distKm / dtH : Infinity;
      if (speedKmh > this.TRAIL_MAX_SPEED_KMH) {
        // A single outlier is dropped; two in a row means the user really moved
        // (e.g. tracking resumed far away), so break the line and continue.
        if (this.consecutiveTrailSpikes >= 1) {
          segments.push([[p.lat, p.lng]]);
          this.lastTrailPoint = { lat: p.lat, lng: p.lng, t: p.timestamp, acc: p.accuracy };
          this.consecutiveTrailSpikes = 0;
          return true;
        }
        this.consecutiveTrailSpikes++;
        return false;
      }
    }

    // Normal fix: extend the current segment.
    const seg = segments[segments.length - 1];
    if (seg) seg.push([p.lat, p.lng]);
    else segments.push([[p.lat, p.lng]]);
    this.lastTrailPoint = { lat: p.lat, lng: p.lng, t: p.timestamp, acc: p.accuracy };
    this.consecutiveTrailSpikes = 0;
    return true;
  }

  // Rebuild the whole trail from raw points (first load / after refresh).
  private rebuildTrail(points: TrackedPoint[]): void {
    const segments: [number, number][][] = [];
    this.lastTrailPoint = null;
    this.consecutiveTrailSpikes = 0;
    for (const p of points) {
      this.pushTrailPoint(segments, p);
    }
    this.userPath.set(segments);
    if (this.map) this.updateUserPathPolyline();
  }

  // Clear the trail and remove its layers.
  private resetTrail(): void {
    this.syncedTrackingPointCount = 0;
    this.lastTrailPoint = null;
    this.consecutiveTrailSpikes = 0;
    this.userPath.set([]);
    if (this.userPathBorder) { this.userPathBorder.remove(); this.userPathBorder = null; }
    if (this.userPathPolyline) { this.userPathPolyline.remove(); this.userPathPolyline = null; }
  }

  // Drop non-finite coordinates and empty segments before rendering.
  private sanitizeSegments(segments: [number, number][][]): [number, number][][] {
    const out: [number, number][][] = [];
    for (const seg of segments) {
      if (!Array.isArray(seg)) continue;
      const clean = seg.filter(pt => this.isValidLatLngTuple(pt));
      if (clean.length) out.push(clean);
    }
    return out;
  }

  // Update the polyline showing user's tracked path. Rendered as multiple segments so
  // GPS gaps appear as breaks instead of long straight bridges.
  private updateUserPathPolyline(): void {
    if (!this.map) return;

    const segments = this.sanitizeSegments(this.userPath());
    const totalPoints = segments.reduce((n, s) => n + s.length, 0);

    // Need at least 2 points to draw a line
    if (totalPoints < 2) {
      if (this.userPathBorder) {
        this.userPathBorder.remove();
        this.userPathBorder = null;
      }
      if (this.userPathPolyline) {
        this.userPathPolyline.remove();
        this.userPathPolyline = null;
      }
      return;
    }

    // Create once; update via setLatLngs (canvas renderer keeps this cheap).
    if (!this.userPathBorder) {
      this.userPathBorder = L.polyline(segments, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.8,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.userPathBorder.setLatLngs(segments);
    }

    if (!this.userPathPolyline) {
      this.userPathPolyline = L.polyline(segments, {
        color: 'green',
        weight: 4,
        opacity: 1,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.userPathPolyline.setLatLngs(segments);
    }

    this.userPathBorder.bringToBack();
    this.userPathPolyline.bringToFront();
  }

  // Toggle draw-by-hand mode
  toggleDrawByHand(): void {
    this.isDrawingMode.update(mode => !mode);

    if (this.isDrawingMode()) {
      // Do NOT clear the drawn path here.
      // This allows users to stop and later continue drawing.
      // Use "➕ New Path" to start from scratch.
      const current = this.customPath();
      this.lastDrawPoint = current.length > 0 ? current[current.length - 1] : null;
      this.enableDrawByHand();
      console.log('✍️ Draw-by-hand enabled - drag on the map to continue drawing');
    } else {
      this.disableDrawByHand();
      console.log('✍️ Draw-by-hand disabled - recorded', this.customPath().length, 'points');
      // Persist drawn path when stopping so it can be resumed/exported.
      // Do not simplify/reduce points here; user expects point count to remain unchanged.
      this.persistDrawnPathToLocalStorage();
    }
  }

  // Start a NEW drawn path without affecting the existing/guide path.
  startNewPath(): void {
    // Clear only the drawn path layer
    this.customPath.set([]);
    this.clearCustomPath();
    this.lastDrawPoint = null;
    localStorage.removeItem(this.drawnRouteStorageKey);

    // Ensure draw-by-hand mode is enabled
    if (!this.isDrawingMode()) {
      this.isDrawingMode.set(true);
      this.enableDrawByHand();
    }
  }

  private enableDrawByHand(): void {
    if (!this.map || this.drawHandlersAttached) return;

    // Disable map interactions while drawing
    this.map.dragging?.disable?.();
    this.map.touchZoom?.disable?.();
    this.map.doubleClickZoom?.disable?.();
    this.map.scrollWheelZoom?.disable?.();
    this.map.boxZoom?.disable?.();
    this.map.keyboard?.disable?.();

    // Attach mouse + touch handlers
    this.map.on('mousedown', this.handleDrawStart);
    this.map.on('mousemove', this.handleDrawMove);
    this.map.on('mouseup', this.handleDrawEnd);
    this.map.on('mouseout', this.handleDrawEnd);

    this.map.on('touchstart', this.handleDrawStart);
    this.map.on('touchmove', this.handleDrawMove);
    this.map.on('touchend', this.handleDrawEnd);
    this.map.on('touchcancel', this.handleDrawEnd);

    this.drawHandlersAttached = true;
  }

  private disableDrawByHand(): void {
    if (!this.map || !this.drawHandlersAttached) return;

    this.map.off('mousedown', this.handleDrawStart);
    this.map.off('mousemove', this.handleDrawMove);
    this.map.off('mouseup', this.handleDrawEnd);
    this.map.off('mouseout', this.handleDrawEnd);

    this.map.off('touchstart', this.handleDrawStart);
    this.map.off('touchmove', this.handleDrawMove);
    this.map.off('touchend', this.handleDrawEnd);
    this.map.off('touchcancel', this.handleDrawEnd);

    // Re-enable map interactions
    this.map.dragging?.enable?.();
    this.map.touchZoom?.enable?.();
    this.map.doubleClickZoom?.enable?.();
    this.map.scrollWheelZoom?.enable?.();
    this.map.boxZoom?.enable?.();
    this.map.keyboard?.enable?.();

    this.isFreehandPointerDown = false;
    this.lastDrawPoint = null;
    this.drawHandlersAttached = false;
  }

  private addDrawPointFromEvent(e: any, isStart: boolean): void {
    if (!e?.latlng) return;
    const now = Date.now();
    if (!isStart && now - this.lastDrawTimeMs < 35) return; // throttle
    this.lastDrawTimeMs = now;

    const currentPoint: [number, number] = [e.latlng.lat, e.latlng.lng];

    if (this.lastDrawPoint) {
      // Only add point if moved at least ~1m
      const distanceKm = this.calculateDistance(this.lastDrawPoint[0], this.lastDrawPoint[1], currentPoint[0], currentPoint[1]);
      if (distanceKm < 0.001) return;
    }

    this.lastDrawPoint = currentPoint;
    this.customPath.update(path => {
      path.push(currentPoint);
      return path;
    });
    this.updateCustomPathPolyline();
  }

  // Calculate distance between two GPS coordinates (in km)
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private clearDirectionMarkers(markers: any[]): void {
    markers.forEach(marker => marker?.remove?.());
    markers.length = 0;
  }

  private calculateBearingDegrees(from: [number, number], to: [number, number]): number {
    const lat1 = from[0] * Math.PI / 180;
    const lat2 = to[0] * Math.PI / 180;
    const dLng = (to[1] - from[1]) * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  private getLookaheadPoint(path: [number, number][], startIndex: number, minDistanceKm: number): [number, number] {
    if (startIndex >= path.length - 1) return path[path.length - 1];

    let distance = 0;
    for (let i = startIndex; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      distance += this.calculateDistance(from[0], from[1], to[0], to[1]);
      if (distance >= minDistanceKm) return to;
    }

    return path[path.length - 1];
  }

  private updateDirectionMarkers(path: [number, number][], markerStore: any[], color: string): void {
    if (!this.map) return;

    this.clearDirectionMarkers(markerStore);
    if (path.length < 2) return;

    const spacingKm = 0.06; // roughly every 60 meters
    let distanceSinceLastArrow = 0;

    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      const segKm = this.calculateDistance(from[0], from[1], to[0], to[1]);
      if (segKm <= 0) continue;

      distanceSinceLastArrow += segKm;
      const isLastSegment = i === path.length - 1;

      if (distanceSinceLastArrow >= spacingKm || isLastSegment) {
        const lookahead = this.getLookaheadPoint(path, i, 0.02);
        const bearing = this.calculateBearingDegrees(from, lookahead);
        // CSS arrow points to the right by default, so offset by -90deg to align with map bearing.
        const rotationDeg = bearing - 90;
        const marker = L.marker(to, {
          icon: L.divIcon({
            className: 'route-direction-arrow-icon',
            html: `<div class="route-direction-arrow" style="transform: rotate(${rotationDeg}deg); color: ${color};"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          }),
          interactive: false,
          keyboard: false
        }).addTo(this.map);

        markerStore.push(marker);
        distanceSinceLastArrow = 0;
      }
    }
  }

  // Simplify path using Douglas-Peucker algorithm
  private simplifyPath(): void {
    const path = this.customPath();
    if (path.length < 3) return;

    // Reduce point count for smoother rendering (only when path is very dense)
    const step = path.length > 400 ? 6 : path.length > 200 ? 4 : 2;
    const simplified = path.filter((_, index) => index % step === 0 || index === path.length - 1);
    this.customPath.set(simplified);
    this.updateCustomPathPolyline();
  }

  private persistDrawnPathToLocalStorage(): void {
    try {
      const path = this.ensureValidPath(this.customPath());
      if (!Array.isArray(path) || path.length < 2) {
        localStorage.removeItem(this.drawnRouteStorageKey);
        return;
      }
      localStorage.setItem(this.drawnRouteStorageKey, JSON.stringify(path));
    } catch (e) {
      console.warn('Failed to persist drawn path:', e);
    }
  }

  private loadDrawnPathFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem(this.drawnRouteStorageKey);
      if (!saved) return;
      const raw = JSON.parse(saved);
      const path = this.sanitizePath(raw);
      if (path.length >= 2) {
        this.customPath.set(path);
      } else {
        localStorage.removeItem(this.drawnRouteStorageKey);
      }
    } catch (e) {
      console.warn('Failed to load drawn path:', e);
    }
  }

  // Add edit markers to path points
  private addEditMarkers(): void {
    const path = this.customPath();

    path.forEach((latlng, index) => {
      const marker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({
          className: 'path-edit-marker',
          html: '<div style="width: 12px; height: 12px; background: #2f8f4e; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      }).addTo(this.map);

      // Update path when marker is dragged
      marker.on('drag', (event: any) => {
        const newPos: [number, number] = [event.latlng.lat, event.latlng.lng];
        this.customPath.update(path => {
          const newPath = [...path];
          newPath[index] = newPos;
          return newPath;
        });
        this.updateCustomPathPolyline();
      });

      // Remove point on right-click
      marker.on('contextmenu', () => {
        this.customPath.update(path => path.filter((_, i) => i !== index));
        marker.remove();
        this.drawingMarkers = this.drawingMarkers.filter(m => m !== marker);
        this.updateCustomPathPolyline();
      });

      this.drawingMarkers.push(marker);
    });
  }

  // Handle map clicks when in drawing mode (legacy - kept for compatibility)
  private onMapClickForDrawing(e: any): void {
    if (!this.isDrawingMode()) return;

    const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
    this.customPath.update(path => {
      path.push(latlng);
      return path;
    });

    // Add a draggable marker for this point
    const marker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: 'path-edit-marker',
        html: '<div style="width: 12px; height: 12px; background: #2f8f4e; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      })
    }).addTo(this.map);

    const index = this.customPath().length - 1;

    // Update path when marker is dragged
    marker.on('drag', (event: any) => {
      const newPos: [number, number] = [event.latlng.lat, event.latlng.lng];
      this.customPath.update(path => {
        const newPath = [...path];
        newPath[index] = newPos;
        return newPath;
      });
      this.updateCustomPathPolyline();
    });

    // Remove point on right-click
    marker.on('contextmenu', () => {
      this.customPath.update(path => path.filter((_, i) => i !== index));
      marker.remove();
      this.drawingMarkers = this.drawingMarkers.filter(m => m !== marker);
      this.updateCustomPathPolyline();
    });

    this.drawingMarkers.push(marker);
    this.updateCustomPathPolyline();
  }

  // Update custom path polyline
  private updateCustomPathPolyline(): void {
    if (!this.map) return;

    const path = this.ensureValidPath(this.customPath());
    if (path.length !== this.customPath().length) {
      this.customPath.set(path);
    }

    if (path.length < 2) {
      if (this.customPathBorder) {
        this.customPathBorder.remove();
        this.customPathBorder = null;
      }
      if (this.customPathPolyline) {
        this.customPathPolyline.remove();
        this.customPathPolyline = null;
      }
      this.clearDirectionMarkers(this.customPathDirectionMarkers);
      return;
    }

    if (!this.customPathBorder) {
      this.customPathBorder = L.polyline(path, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.8,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.customPathBorder.setLatLngs(path);
    }

    if (!this.customPathPolyline) {
      this.customPathPolyline = L.polyline(path, {
        color: 'red',
        weight: 4,
        opacity: 1,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.customPathPolyline.setLatLngs(path);
    }

    this.customPathBorder.bringToBack();
    this.customPathPolyline.bringToFront();
    this.updateDirectionMarkers(path, this.customPathDirectionMarkers, '#dc2626');
  }

  // Update guide path polyline (existing route) - separate layer
  private updateGuidePathPolyline(): void {
    if (!this.map) return;

    const path = this.ensureValidPath(this.guidePath());
    if (path.length !== this.guidePath().length) {
      this.guidePath.set(path);
    }

    if (path.length < 2) {
      if (this.guidePathBorder) {
        this.guidePathBorder.remove();
        this.guidePathBorder = null;
      }
      if (this.guidePathPolyline) {
        this.guidePathPolyline.remove();
        this.guidePathPolyline = null;
      }
      this.clearDirectionMarkers(this.guidePathDirectionMarkers);
      return;
    }

    if (!this.guidePathBorder) {
      this.guidePathBorder = L.polyline(path, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.7,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.guidePathBorder.setLatLngs(path);
    }

    if (!this.guidePathPolyline) {
      this.guidePathPolyline = L.polyline(path, {
        color: 'red',
        weight: 4,
        opacity: 0.95,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.vectorRenderer || undefined
      }).addTo(this.map);
    } else {
      this.guidePathPolyline.setLatLngs(path);
    }

    // Keep guide path behind the user's/drawn overlays
    this.guidePathBorder.bringToBack();
    this.guidePathPolyline.bringToBack();
    const guideArrowColor = this.isMission16CompletedForRoute() ? '#1f6b3a' : '#dc2626';
    this.updateDirectionMarkers(path, this.guidePathDirectionMarkers, guideArrowColor);
  }

  private clearGuidePath(): void {
    if (this.guidePathBorder) {
      this.guidePathBorder.remove();
      this.guidePathBorder = null;
    }
    if (this.guidePathPolyline) {
      this.guidePathPolyline.remove();
      this.guidePathPolyline = null;
    }
    this.clearDirectionMarkers(this.guidePathDirectionMarkers);
  }

  // Clear custom path
  clearCustomPath(): void {
    if (this.customPathBorder) {
      this.customPathBorder.remove();
      this.customPathBorder = null;
    }
    if (this.customPathPolyline) {
      this.customPathPolyline.remove();
      this.customPathPolyline = null;
    }
    this.clearDirectionMarkers(this.customPathDirectionMarkers);

    // Remove all drawing markers
    this.drawingMarkers.forEach(marker => marker.remove());
    this.drawingMarkers = [];
  }

  // Save custom path to localStorage and export
  saveCustomPath(): void {
    let path: any;
    try {
      const saved = localStorage.getItem(this.drawnRouteStorageKey);
      path = saved ? JSON.parse(saved) : this.customPath();
    } catch {
      path = this.customPath();
    }

    if (path.length < 2) {
      alert('Please draw a path with at least 2 points');
      return;
    }

    // Create downloadable JSON file
    const dataStr = JSON.stringify(path, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `botany-route-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    // Exit drawing mode
    if (this.isDrawingMode()) {
      this.toggleDrawByHand();
    }

    // Remove edit markers
    this.drawingMarkers.forEach(marker => marker.remove());
    this.drawingMarkers = [];

    console.log('✅ Path saved and exported!');
    alert('Path saved and downloaded! Share the JSON file with other users.');
  }

  // Load custom path from localStorage
  loadCustomPath(): void {
    // If we already have a guide path, just ensure it's rendered.
    if (this.guidePath().length >= 2) {
      this.updateGuidePathPolyline();
      return;
    }

    const saved = localStorage.getItem('customRoutePath');
    if (saved) {
      try {
        const raw = JSON.parse(saved);
        const path = this.sanitizePath(raw);
        if (path.length >= 2) {
          this.guidePath.set(path);
          this.updateGuidePathPolyline();
          console.log('✅ Custom path loaded from localStorage');
          return;
        }
      } catch (e) {
        console.error('Failed to load custom path:', e);
      }
    }

    // Fallback: load bundled guide route from assets (one-time attempt)
    if (this.didAttemptLoadCustomPath) return;
    this.didAttemptLoadCustomPath = true;

    const routeAssetUrl = this.getDefaultRouteAssetUrl();

    fetch(routeAssetUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((path: any) => {
        const sanitized = this.sanitizePath(path);
        if (sanitized.length < 2) return;
        this.guidePath.set(sanitized);
        this.updateGuidePathPolyline();
        console.log('✅ Default guide route loaded from assets:', routeAssetUrl);
      })
      .catch(err => {
        console.warn('No default guide route found:', routeAssetUrl, err);
      });
  }

  // Import custom path from file
  importCustomPath(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const raw = JSON.parse(e.target.result);
        const path = this.sanitizePath(raw);

        if (path.length < 2) {
          alert('Invalid path file format');
          return;
        }

        this.guidePath.set(path);
        localStorage.setItem('customRoutePath', JSON.stringify(path));

        this.updateGuidePathPolyline();
        console.log('✅ Custom path imported successfully');
        alert('Path imported successfully!');
      } catch (error) {
        console.error('Failed to import path:', error);
        alert('Failed to import path. Please check the file format.');
      }
    };
    reader.readAsText(file);
  }

  // Clear custom path and revert to auto-generated
  clearAndResetPath(): void {
    this.guidePath.set([]);
    this.clearGuidePath();
    localStorage.removeItem('customRoutePath');
    console.log('✅ Custom path cleared');
  }

  // Handle readMore link click - open in new tab and earn star
  openReadMore(checkpointId: number, url: string): void {
    if (!url) return;

    // Open link in new tab
    window.open(url, '_blank');

    // Mark as clicked and earn star
    const clicked = this.readMoreClicked();
    const checkpointIdStr = `checkpoint_${checkpointId}`;

    if (!clicked.has(checkpointIdStr)) {
      clicked.add(checkpointIdStr);
      this.readMoreClicked.set(clicked);

      // Increment stars
      this.starsEarned.update(stars => stars + 1);

      // Save to localStorage
      const starData = {
        starsEarned: this.starsEarned(),
        readMoreClicked: Array.from(clicked)
      };
      localStorage.setItem('botany_stars', JSON.stringify(starData));

      // Update checkpoint with star earned
      this.checkpoints.update(checkpoints =>
        checkpoints.map(cp =>
          cp.id === checkpointId ? { ...cp, starEarned: true } : cp
        )
      );

      // Save updated checkpoints
      localStorage.setItem('missions', JSON.stringify(this.checkpoints()));

      console.log(`⭐ Star earned! Total stars: ${this.starsEarned()}`);
    }
  }

  // Load earned stars from localStorage on init
  private loadEarnedStars(): void {
    const data = this.storage.getBotanyStars();
    if (data) {
      this.starsEarned.set(data.starsEarned || 0);
      this.readMoreClicked.set(new Set(data.readMoreClicked || []));
      console.log(`⭐ Loaded ${this.starsEarned()} earned stars`);
    }
  }
}
