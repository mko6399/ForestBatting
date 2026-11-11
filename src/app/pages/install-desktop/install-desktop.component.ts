import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LanguageService } from '../../services/language.service';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Platform = 'ios' | 'android' | 'desktop-chromium' | 'desktop-safari' | 'desktop-firefox' | 'unknown';

/** Keys under translations.*.install used for the status line. */
type DetailKey =
  | 'msgPreparing' | 'msgAlmostReady' | 'msgInApp' | 'msgIos' | 'msgAndroid'
  | 'msgDesktopChromium' | 'msgFirefox' | 'msgDesktopSafari' | 'msgGeneric'
  | 'msgInstalledMobile' | 'msgInstalledDesktop' | 'msgAlreadyInstalled'
  | 'msgAcceptedMobile' | 'msgAcceptedDesktop' | 'msgDismissed'
  | 'msgNotAvailableSession' | 'msgFailedPrefix' | '';

const RELOAD_GUARD_KEY = 'install-desktop:sw-reloaded';

/**
 * "Install this web app" page — works on desktop and mobile.
 *
 * Not linked anywhere in the app navigation: it is a deep link you hand out
 * on purpose (e.g. https://.../install-desktop). Anyone who knows the path can
 * open it, but nothing in the UI points here.
 *
 * Chromium (desktop + Android) only fires `beforeinstallprompt` once a service
 * worker controls the page. The main app defers SW registration by up to 30s
 * (registerWhenStable:30000) so it does not compete with the first GPS fix, so
 * this page registers `ngsw-worker.js` itself, right away, and waits for the
 * prompt instead of giving up after a few seconds.
 */
@Component({
  selector: 'app-install-desktop',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './install-desktop.component.html',
  styleUrls: ['./install-desktop.component.scss']
})
export class InstallDesktopComponent {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private route = inject(ActivatedRoute);
  private languageService = inject(LanguageService);

  private deferredPrompt: DeferredInstallPrompt | null = null;

  status = signal<'idle' | 'preparing' | 'ready' | 'installing' | 'installed' | 'unavailable' | 'dismissed'>('idle');

  /** Translation key for the status line, resolved reactively so it follows language changes. */
  private detailKey = signal<DetailKey>('');
  private detailExtra = signal<string>('');

  /** Install-page translation bundle for the current language. */
  tr = computed(() => this.languageService.t().install);
  lang = computed(() => this.languageService.currentLanguage().code);

  details = computed(() => {
    const key = this.detailKey();
    if (!key) return '';
    const dict = this.tr() as unknown as Record<string, string>;
    const base = dict[key] ?? '';
    const extra = this.detailExtra();
    return extra ? `${base} (${extra})` : base;
  });

  statusTitle = computed(() => {
    const t = this.tr();
    switch (this.status()) {
      case 'preparing': return t.statePreparing;
      case 'ready': return t.stateReady;
      case 'installing': return t.stateInstalling;
      case 'installed': return t.stateInstalled;
      case 'dismissed': return t.stateDismissed;
      case 'unavailable': return t.stateUnavailable;
      default: return t.stateChecking;
    }
  });

  canInstall = computed(() => this.status() === 'ready');
  isPreparing = computed(() => this.status() === 'preparing');
  isStandalone = signal(false);
  platform = signal<Platform>('unknown');

  isMobile = computed(() => this.platform() === 'ios' || this.platform() === 'android');
  isIOS = computed(() => this.platform() === 'ios');
  isChromium = computed(() => this.platform() === 'android' || this.platform() === 'desktop-chromium');

  // Safari (iOS + macOS) has no install API, so we can't open the
  // "Add to Home Screen" / "Add to Dock" dialog from script. Instead we show a
  // guided prompt that points the user straight at the Share / File menu.
  isSafari = computed(() => this.platform() === 'ios' || this.platform() === 'desktop-safari');
  safariGuideOpen = signal(false);

  debugText = signal<string>('');
  private debug = false;

  setLang(code: string): void {
    this.languageService.setLanguage(code);
  }

  toggleSafariGuide(): void {
    this.safariGuideOpen.update(v => !v);
  }

  reload(): void {
    if (this.isBrowser) window.location.reload();
  }

  private detectPlatform(): Platform {
    const ua = navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports as Mac; disambiguate by touch support.
      (/Macintosh/.test(ua) && 'ontouchend' in document);
    if (isIOS) return 'ios';
    if (/Android/.test(ua)) return 'android';

    if (/Firefox\//.test(ua)) return 'desktop-firefox';
    if (/Edg\//.test(ua) || /OPR\//.test(ua) || /Chrome\//.test(ua)) return 'desktop-chromium';
    if (/Safari\//.test(ua)) return 'desktop-safari';
    return 'unknown';
  }

  private isInAppBrowser(): boolean {
    return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger/i.test(navigator.userAgent);
  }

  constructor() {
    if (!this.isBrowser) return;

    this.debug = ['1', 'true', 'yes'].includes(
      (this.route.snapshot.queryParamMap.get('debug') ?? '').toLowerCase()
    );

    this.platform.set(this.detectPlatform());

    // Already running as an installed app?
    const mm = window.matchMedia?.('(display-mode: standalone)');
    const standaloneNow = !!mm?.matches || (navigator as any).standalone === true;
    this.isStandalone.set(standaloneNow);

    // Chromium (desktop + Android) fires this when the app is installable.
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as DeferredInstallPrompt;
      this.status.set('ready');
      this.detailKey.set('');
    });

    window.addEventListener('appinstalled', () => {
      this.status.set('installed');
      this.detailKey.set(this.isMobile() ? 'msgInstalledMobile' : 'msgInstalledDesktop');
    });

    if (this.isStandalone()) {
      this.status.set('installed');
      this.detailKey.set('msgAlreadyInstalled');
      return;
    }

    void this.prepareInstall();
  }

  /**
   * Make the page installable as fast as possible: register the service worker
   * now (not in 30s), reload once when it takes control so Chromium re-checks
   * installability, and only fall back to manual instructions if the prompt
   * still never comes.
   */
  private async prepareInstall(): Promise<void> {
    const swSupported = 'serviceWorker' in navigator;

    // Safari / Firefox / in-app / unknown: no beforeinstallprompt is ever
    // coming, so go straight to guidance.
    if (!this.isChromium()) {
      window.setTimeout(() => this.fallbackToManual(), 1500);
      return;
    }

    this.status.set('preparing');
    this.detailKey.set('msgPreparing');

    if (swSupported) {
      // `ng serve` does not build ngsw-worker.js (and Angular's own SW is
      // disabled in dev), so only self-register in a real build.
      if (!isDevMode()) {
        try {
          await navigator.serviceWorker.register('ngsw-worker.js', { scope: '/' });
        } catch {
          // Angular may have already registered it, or this build has none.
        }
      }

      // When the worker starts controlling this page, Chromium only re-evaluates
      // installability on the next load — so reload once (guarded).
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.status() === 'ready' || this.status() === 'installed') return;
        if (!this.hasReloadedForSw()) {
          this.markReloadedForSw();
          window.location.reload();
        }
      });

      // If a worker is already active but somehow not controlling, a reload
      // hands control over.
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active && !navigator.serviceWorker.controller && !this.hasReloadedForSw()) {
          this.markReloadedForSw();
          window.location.reload();
          return;
        }
      } catch {
        // ignore
      }
    }

    // Give the browser real time to fire beforeinstallprompt (manifest fetch +
    // SW activation can take a while on a first visit / slow connection).
    window.setTimeout(() => {
      if (this.status() === 'ready' || this.status() === 'installed') return;
      void this.finishPreparing(swSupported);
    }, 12000);
  }

  private async finishPreparing(swSupported: boolean): Promise<void> {
    if (this.debug) this.debugText.set(await this.getDiagnostics());

    const controlling = swSupported && !!navigator.serviceWorker.controller;

    if (controlling) {
      // Everything is in place but the event has not fired. A manual reload
      // almost always surfaces the prompt; otherwise the browser menu works.
      this.status.set('unavailable');
      this.detailKey.set('msgAlmostReady');
      return;
    }

    this.fallbackToManual();
  }

  private fallbackToManual(): void {
    if (this.status() === 'ready' || this.status() === 'installed') return;
    this.status.set('unavailable');

    if (this.isInAppBrowser()) {
      this.detailKey.set('msgInApp');
    } else if (this.platform() === 'ios') {
      this.detailKey.set('msgIos');
    } else if (this.platform() === 'android') {
      this.detailKey.set('msgAndroid');
    } else if (this.platform() === 'desktop-chromium') {
      this.detailKey.set('msgDesktopChromium');
    } else if (this.platform() === 'desktop-firefox') {
      this.detailKey.set('msgFirefox');
    } else if (this.platform() === 'desktop-safari') {
      this.detailKey.set('msgDesktopSafari');
    } else {
      this.detailKey.set('msgGeneric');
    }

    if (this.debug && !this.debugText()) {
      void this.getDiagnostics().then(d => this.debugText.set(d));
    }
  }

  private hasReloadedForSw(): boolean {
    try {
      return sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
    } catch {
      return true; // if storage is blocked, never risk a reload loop
    }
  }

  private markReloadedForSw(): void {
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    } catch {
      // ignore
    }
  }

  private async getDiagnostics(): Promise<string> {
    const parts: string[] = [
      `platform=${this.platform()}`,
      `secureContext=${window.isSecureContext}`,
      `standalone=${this.isStandalone()}`,
      `manifestLink=${!!document.querySelector('link[rel="manifest"]')}`,
      `swSupported=${'serviceWorker' in navigator}`,
    ];
    try {
      parts.push(`swController=${!!navigator.serviceWorker.controller}`);
      const reg = await navigator.serviceWorker.getRegistration();
      parts.push(`swActive=${!!reg?.active}`);
      parts.push(`swScope=${reg?.scope ?? 'none'}`);
    } catch {
      parts.push('swController=err');
    }
    parts.push(`reloadedForSw=${this.hasReloadedForSw()}`);
    return parts.join(' • ');
  }

  async install(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.status() === 'installing') return;

    if (!this.deferredPrompt) {
      this.status.set('unavailable');
      this.detailKey.set('msgNotAvailableSession');
      return;
    }

    try {
      this.status.set('installing');
      await this.deferredPrompt.prompt();

      const choice = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;

      if (choice.outcome === 'accepted') {
        this.status.set('installed');
        this.detailKey.set(this.isMobile() ? 'msgAcceptedMobile' : 'msgAcceptedDesktop');
      } else {
        this.status.set('dismissed');
        this.detailKey.set('msgDismissed');
      }
    } catch (err: unknown) {
      this.status.set('unavailable');
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error';
      this.detailKey.set('msgFailedPrefix');
      this.detailExtra.set(msg);
    }
  }
}
