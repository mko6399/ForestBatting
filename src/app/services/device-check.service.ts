import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { HelpIssueId, Platform } from '../config/device-help';

export type InAppBrowser = 'line' | 'facebook' | 'instagram' | 'messenger' | 'tiktok' | 'wechat' | 'other' | null;

export interface DeviceEnv {
  platform: Platform;
  /** Major iOS version, or null when not iOS / not readable. */
  iosVersion: number | null;
  browser: 'safari' | 'chrome' | 'samsung' | 'firefox' | 'edge' | 'other';
  inApp: InAppBrowser;
  /** Running from the Home Screen / as an installed app. */
  standalone: boolean;
  secure: boolean;
}

export type CheckState = 'ok' | 'warn' | 'fail' | 'unknown' | 'running';

export interface CheckResult {
  id: string;
  state: CheckState;
  /** Help entry to open when the visitor taps "how to fix". */
  help?: HelpIssueId;
  detail?: string;
}

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

interface WakeLockSentinelLike { release(): Promise<void>; addEventListener(t: 'release', cb: () => void): void; }

/** Accuracy (metres) above which a fix is treated as "Precise Location is off". */
const APPROXIMATE_THRESHOLD_M = 1500;
/** How long the page may be hidden mid-walk before we tell the visitor tracking paused. */
const PAUSE_NOTICE_AFTER_MS = 20_000;
const SS_SHOWN = 'deviceHelp.shown';

/**
 * Works out what kind of device and browser this is, turns raw failures (a geolocation
 * error code, a throwing localStorage) into a named cause from config/device-help.ts, and
 * owns the help sheet that explains that cause.
 *
 * Detection is deliberately conservative: when a browser will not tell us something
 * (iOS Safari and the Permissions API, for one), we say 'unknown' rather than guess, and the
 * help text covers every place the switch could be.
 */
@Injectable({ providedIn: 'root' })
export class DeviceCheckService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly env: DeviceEnv = this.detect();

  // ---- help sheet ---------------------------------------------------------------------

  private readonly _open = signal<HelpIssueId | null>(null);
  readonly openIssue = computed(() => this._open());

  /** Callback for the sheet's "Try again" button; set by whoever can retry. */
  retryLocation: (() => void) | null = null;

  /** Show the explanation for a cause. */
  show(issue: HelpIssueId): void {
    this._open.set(issue);
  }

  /**
   * Show it, but only once per browser session — for causes that recur on their own
   * (weak signal, screen locked) and would otherwise nag on every occurrence.
   */
  showOnce(issue: HelpIssueId): void {
    const shown = this.readShown();
    if (shown.includes(issue)) return;
    this.writeShown([...shown, issue]);
    this.show(issue);
  }

  close(): void {
    this._open.set(null);
  }

  // ---- install --------------------------------------------------------------------------

  private deferredInstall: DeferredInstallPrompt | null = null;
  private readonly _canInstall = signal(false);
  /** True on Android/desktop Chrome once the browser offers a one-tap install. */
  readonly canInstall = computed(() => this._canInstall());

  async install(): Promise<boolean> {
    const prompt = this.deferredInstall;
    if (!prompt) return false;
    this.deferredInstall = null;
    this._canInstall.set(false);
    try {
      await prompt.prompt();
      return (await prompt.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  }

  /** Which install guide fits this device, or null when installing is not possible/needed. */
  installGuide(): HelpIssueId | null {
    if (this.env.standalone || this.env.inApp) return null;
    if (this.env.platform === 'ios') return 'install-ios';
    return 'install-android';
  }

  // ---- leaving in-app browsers ----------------------------------------------------------

  /**
   * Best link out of an in-app browser for this device.
   *  - LINE honours ?openExternalBrowser=1 and hands the page to the default browser.
   *  - Android: an intent:// URL opens Chrome directly.
   *  - iOS 17+: the x-safari-https:// scheme opens Safari from another app's web view.
   */
  externalBrowserUrl(href = this.isBrowser ? location.href : '/'): string {
    const url = new URL(href, this.isBrowser ? location.origin : 'https://localhost');
    if (this.env.inApp === 'line') {
      url.searchParams.set('openExternalBrowser', '1');
      return url.toString();
    }
    if (this.env.platform === 'android') {
      return `intent://${url.host}${url.pathname}${url.search}${url.hash}`
        + `#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
    }
    if (this.env.platform === 'ios') {
      return url.toString().replace(/^https:\/\//, 'x-safari-https://');
    }
    return url.toString();
  }

  openExternal(): void {
    if (!this.isBrowser) return;
    window.location.href = this.externalBrowserUrl();
  }

  // ---- geolocation diagnosis ----------------------------------------------------------

  private approximateStreak = 0;
  private timeoutStreak = 0;

  /** Name the cause of a geolocation error and show it. */
  reportGeoError(code: number | undefined): void {
    if (code === 1) {
      this.timeoutStreak = 0;
      this.show('geo-denied');
    } else if (code === 2) {
      this.showOnce('geo-unavailable');
    } else if (code === 3) {
      // A single timeout under canopy is normal and recovers by itself.
      if (++this.timeoutStreak >= 2) this.showOnce('geo-timeout');
    }
  }

  /**
   * Called for every live fix. Several kilometre-scale fixes in a row means the phone is
   * sharing an approximate location on purpose (iOS 14+/Android 12+ "Precise" switch off) —
   * a cold GPS start is coarse too, but only for the first fix or two.
   */
  reportFix(accuracy: number | undefined): void {
    this.timeoutStreak = 0;
    if (accuracy !== undefined && accuracy >= APPROXIMATE_THRESHOLD_M) {
      if (++this.approximateStreak >= 3) this.showOnce('geo-approximate');
    } else {
      this.approximateStreak = 0;
    }
  }

  /** One-off position read for the readiness check page. */
  testLocation(): Promise<{ ok: true; accuracy: number } | { ok: false; code: number }> {
    return new Promise(resolve => {
      if (!this.isBrowser || !('geolocation' in navigator)) {
        resolve({ ok: false, code: 0 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ ok: true, accuracy: Math.round(p.coords.accuracy) }),
        e => resolve({ ok: false, code: e.code }),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      );
    });
  }

  // ---- screen wake lock + paused tracking ------------------------------------------------

  private wakeLock: WakeLockSentinelLike | null = null;
  private wantWakeLock = false;
  private hiddenAt: number | null = null;
  private trackingActive = false;

  readonly wakeLockSupported = this.isBrowser && 'wakeLock' in navigator;

  /** Keep the screen on and watch for the page going to the background during a walk. */
  setTracking(active: boolean): void {
    this.trackingActive = active;
    this.wantWakeLock = active;
    if (active) void this.acquireWakeLock();
    else void this.releaseWakeLock();
  }

  private async acquireWakeLock(): Promise<void> {
    if (!this.wakeLockSupported || this.wakeLock || document.visibilityState !== 'visible') return;
    try {
      const lock = await (navigator as any).wakeLock.request('screen') as WakeLockSentinelLike;
      this.wakeLock = lock;
      lock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {
      // Refused (low power mode, or no user activation yet). Tracking still works while the
      // screen is on; the tracking-paused notice covers the rest.
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try { await lock?.release(); } catch { /* already released */ }
  }

  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      return;
    }
    // Browsers drop the wake lock whenever the page is hidden; take it again.
    if (this.wantWakeLock) void this.acquireWakeLock();
    if (this.trackingActive && this.hiddenAt && Date.now() - this.hiddenAt > PAUSE_NOTICE_AFTER_MS) {
      this.showOnce('tracking-paused');
    }
    this.hiddenAt = null;
  }

  // ---- storage ---------------------------------------------------------------------------

  /** Whether localStorage accepts a write at all (false in some private modes / blocked data). */
  storageWritable(): boolean {
    if (!this.isBrowser) return true;
    try {
      const k = '__fb_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  /** Ask the browser not to evict our data under storage pressure / Safari's 7-day rule. */
  async requestPersistence(): Promise<boolean | null> {
    if (!this.isBrowser || !navigator.storage?.persist) return null;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch {
      return null;
    }
  }

  // ---- full readiness check ----------------------------------------------------------------

  /** Everything that can be checked without asking the visitor anything. */
  async quickChecks(): Promise<CheckResult[]> {
    const e = this.env;
    const out: CheckResult[] = [];

    out.push(e.inApp
      ? { id: 'browser', state: 'fail', help: 'in-app-browser', detail: e.inApp }
      : { id: 'browser', state: 'ok', detail: `${e.browser}${e.iosVersion ? ' · iOS ' + e.iosVersion : ''}` });

    out.push({ id: 'secure', state: e.secure ? 'ok' : 'fail', help: e.secure ? undefined : 'insecure-context' });

    out.push(this.isBrowser && 'geolocation' in navigator
      ? { id: 'geo-support', state: 'ok' }
      : { id: 'geo-support', state: 'fail', help: 'geo-unsupported' });

    out.push(this.storageWritable()
      ? { id: 'storage', state: 'ok' }
      : { id: 'storage', state: 'fail', help: 'storage-blocked' });

    const persisted = await this.requestPersistence();
    out.push({
      id: 'persist',
      state: persisted ? 'ok' : (e.platform === 'ios' ? 'warn' : 'unknown'),
      help: persisted ? undefined : 'storage-eviction',
    });

    out.push({ id: 'wakelock', state: this.wakeLockSupported ? 'ok' : 'warn', help: this.wakeLockSupported ? undefined : 'tracking-paused' });

    out.push({ id: 'online', state: this.isBrowser && navigator.onLine ? 'ok' : 'warn', help: navigator.onLine ? undefined : 'offline' });

    const notifOk = this.isBrowser && 'Notification' in window;
    out.push({
      id: 'notify',
      state: notifOk ? 'ok' : 'warn',
      help: notifOk ? undefined : (e.platform === 'ios' ? 'notifications-ios' : undefined),
    });

    return out;
  }

  // ---- setup ---------------------------------------------------------------------------

  constructor() {
    if (!this.isBrowser) return;

    window.addEventListener('beforeinstallprompt', (ev: Event) => {
      ev.preventDefault();
      this.deferredInstall = ev as DeferredInstallPrompt;
      this._canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstall = null;
      this._canInstall.set(false);
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('offline', () => this.showOnce('offline'));
  }

  private detect(): DeviceEnv {
    if (!this.isBrowser) {
      return { platform: 'other', iosVersion: null, browser: 'other', inApp: null, standalone: false, secure: true };
    }
    const ua = navigator.userAgent;
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const iosMatch = ua.match(/OS (\d+)_\d+/) ?? ua.match(/Version\/(\d+)\./);

    let inApp: InAppBrowser = null;
    if (/Line\//i.test(ua)) inApp = 'line';
    else if (/Instagram/i.test(ua)) inApp = 'instagram';
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) inApp = 'facebook';
    else if (/Messenger/i.test(ua)) inApp = 'messenger';
    else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) inApp = 'tiktok';
    else if (/MicroMessenger/i.test(ua)) inApp = 'wechat';
    else if (isAndroid && /; wv\)/.test(ua)) inApp = 'other';

    let browser: DeviceEnv['browser'] = 'other';
    if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
    else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge';
    else if (/FxiOS|Firefox/.test(ua)) browser = 'firefox';
    else if (/CriOS|Chrome/.test(ua)) browser = 'chrome';
    else if (/Safari/.test(ua)) browser = 'safari';

    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;

    return {
      platform: isIos ? 'ios' : isAndroid ? 'android' : 'other',
      iosVersion: isIos && iosMatch ? Number(iosMatch[1]) : null,
      browser,
      inApp,
      standalone: !!standalone,
      secure: window.isSecureContext,
    };
  }

  private readShown(): HelpIssueId[] {
    try {
      return JSON.parse(sessionStorage.getItem(SS_SHOWN) || '[]');
    } catch {
      return [];
    }
  }

  private writeShown(ids: HelpIssueId[]): void {
    try {
      sessionStorage.setItem(SS_SHOWN, JSON.stringify(ids));
    } catch {
      // Private mode: the notice may repeat. Acceptable.
    }
  }
}
