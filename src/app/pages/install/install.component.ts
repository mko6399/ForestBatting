import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

@Component({
  selector: 'app-install',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.scss']
})
export class InstallComponent {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private route = inject(ActivatedRoute);

  private deferredPrompt: DeferredInstallPrompt | null = null;

  token = computed(() =>
    this.route.snapshot.queryParamMap.get('token') ??
    this.route.snapshot.queryParamMap.get('key') ??
    this.route.snapshot.queryParamMap.get('k')
  );

  autostart = computed(() => {
    const v = this.route.snapshot.queryParamMap.get('autostart');
    return v === '1' || v === 'true' || v === 'yes';
  });

  status = signal<'idle' | 'ready' | 'installing' | 'installed' | 'unavailable' | 'dismissed'>('idle');
  details = signal<string>('');

  canInstall = computed(() => this.status() === 'ready');
  isStandalone = signal(false);
  deviceType = signal<'ios' | 'android' | 'unknown'>('unknown');

  private debug = computed(() => {
    const v = this.route.snapshot.queryParamMap.get('debug');
    return v === '1' || v === 'true' || v === 'yes';
  });

  private getDeviceInfo(): { isIOS: boolean; isAndroid: boolean; isSafari: boolean; isInApp: boolean } {
    const ua = navigator.userAgent;
    return {
      isIOS: /iPad|iPhone|iPod/.test(ua),
      isAndroid: /Android/.test(ua),
      isSafari: /Safari/.test(ua) && !/Chrome|CriOS|OPR/.test(ua),
      isInApp: /FBAN|FBAV|Instagram|Line\//i.test(ua)
    };
  }

  private async getDiagnostics(): Promise<string> {
    if (!this.isBrowser) return '';

    const url = new URL(window.location.href);
    const secureContext = window.isSecureContext;
    const protocol = url.protocol;
    const hasManifestLink = !!document.querySelector('link[rel="manifest"]');
    const swSupported = 'serviceWorker' in navigator;
    const device = this.getDeviceInfo();

    let swController = false;
    let swScope: string | null = null;
    let swScript: string | null = null;
    try {
      swController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.getRegistration();
      swScope = reg?.scope ?? null;
      swScript = reg?.active?.scriptURL ?? null;
    } catch {
      // ignore
    }

    const lines = [
      `secureContext=${secureContext}`,
      `protocol=${protocol}`,
      `manifestLink=${hasManifestLink}`,
      `swSupported=${swSupported}`,
      `swController=${swController}`,
      `swScope=${swScope ?? 'none'}`,
      `swScript=${swScript ? new URL(swScript).pathname : 'none'}`,
      `inAppBrowser=${device.isInApp}`,
      `device=iOS:${device.isIOS}|Android:${device.isAndroid}|Safari:${device.isSafari}`,
    ];

    // Add a very short hint if we can.
    if (!secureContext) {
      lines.push('hint=Requires HTTPS (secure context)');
    } else if (!swSupported) {
      lines.push('hint=Service workers not supported');
    } else if (!swScript) {
      lines.push('hint=No service worker registered (likely dev build)');
    } else if (device.isIOS && device.isSafari) {
      lines.push('hint=iOS Safari: Use Share → Add to Home Screen');
    } else if (device.isInApp) {
      lines.push('hint=In-app browsers block install prompts. Open in native browser instead');
    }

    return lines.join(' • ');
  }

  constructor() {
    if (!this.isBrowser) return;

    // Detect device type
    const device = this.getDeviceInfo();
    if (device.isIOS) {
      this.deviceType.set('ios');
    } else if (device.isAndroid) {
      this.deviceType.set('android');
    }

    // Detect if already running as an installed app.
    const mm = window.matchMedia?.('(display-mode: standalone)');
    const standaloneNow = !!mm?.matches || (navigator as any).standalone === true;
    this.isStandalone.set(standaloneNow);

    // Capture the install prompt when the browser decides the app is installable.
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as DeferredInstallPrompt;
      this.status.set('ready');
      this.details.set('');
    });

    window.addEventListener('appinstalled', () => {
      this.status.set('installed');
      this.details.set('Installed successfully. You can now close this page.');
    });

    // If we never get beforeinstallprompt (iOS Safari / already installed / not eligible)
    // we still show the page but explain.
    setTimeout(() => {
      if (this.status() === 'idle') {
        if (this.isStandalone()) {
          this.status.set('installed');
          this.details.set('This looks like it is already installed.');
        } else {
          this.status.set('unavailable');
          const device = this.getDeviceInfo();

          let message = '';

          // Device-specific guidance
          if (device.isIOS && device.isSafari) {
            message = 'iOS Safari does not support the install prompt. Please use: Share → Add to Home Screen';
          } else if (device.isInApp) {
            message = 'You are using an in-app browser which blocks installation. Please open this link in Safari, Chrome, or your native browser.';
          } else {
            message = 'Install prompt is not available. This usually happens when the app is not installable yet (no service worker, missing manifest/icons, not HTTPS), or when opened in an in-app browser.';
          }

          // If service worker is disabled due to dev build, call it out directly.
          const devHint =
            'If you are running `ng serve` (development), the service worker is typically not registered and install will not work. Try `ng serve --configuration production` or deploy a production build over HTTPS.';

          if (this.debug()) {
            void this.getDiagnostics().then(d => {
              this.details.set(`${message} ${devHint}\n\nDebug: ${d}`);
            });
          } else {
            this.details.set(`${message} ${devHint}`);
          }
        }
      }
    }, 3000);

    // “Auto” install is still restricted by browser rules: it must follow a user gesture.
    // For autostart=1 we guide the user to tap anywhere once.
    if (this.autostart()) {
      const onFirstGesture = async () => {
        if (!this.deferredPrompt) {
            return;
        }
        window.removeEventListener('click', onFirstGesture);
        // Attempt install as soon as the user interacts once.
        await this.install();
      };
      window.addEventListener('click', onFirstGesture);
    }
  }

  async install(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.status() === 'installing') return;

    if (!this.deferredPrompt) {
      this.status.set('unavailable');
      this.details.set('Install is not available in this browser/session.');
      return;
    }

    try {
      this.status.set('installing');
      await this.deferredPrompt.prompt();

      const choice = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;

      if (choice.outcome === 'accepted') {
        // appinstalled event usually fires next; keep a friendly status.
        this.status.set('installed');
        this.details.set('Install accepted. If nothing happened, check your home screen/app list.');
      } else {
        this.status.set('dismissed');
        this.details.set('Install dismissed by user.');
      }
    } catch (err: unknown) {
      this.status.set('unavailable');
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error';
      if (this.debug()) {
        const diag = await this.getDiagnostics();
        this.details.set(`Install failed or is blocked by the browser. (${msg})\n\nDebug: ${diag}`);
      } else {
        this.details.set('Install failed or is blocked by the browser.');
      }
    }
  }
}
