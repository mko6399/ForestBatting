import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-open-browser',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="handoff" *ngIf="showHandoff(); else loading" aria-labelledby="handoff-title">
      <section class="panel">
        <p class="eyebrow">Forest Bathing Trail</p>
        <h1 id="handoff-title">Open in your phone's browser</h1>
        <p class="message">
          This link opened inside {{ appName() }}. For the best experience, open it in Safari or Chrome.
        </p>

        <a class="primary-action" *ngIf="!isIos(); else iosAction" [href]="browserLink()" target="_blank" rel="noopener">
          Open in browser
        </a>

        <ng-template #iosAction>
          <button class="primary-action" type="button" (click)="copyLink()">
            Copy link for Safari
          </button>
        </ng-template>

        <p class="hint" *ngIf="isIos()">
          In LINE, tap <strong>...</strong> at the top, then choose <strong>Open in Safari</strong>. If that option is not visible, tap <strong>Copy link</strong> and paste it into Safari.
        </p>
        <p class="hint" *ngIf="isAndroid()">
          If Chrome does not open, use the menu and choose <strong>Open in Chrome</strong>.
        </p>
        <p class="hint" *ngIf="!isIos() && !isAndroid()">
          Use your app's menu and choose <strong>Open in browser</strong>.
        </p>
      </section>
    </main>

    <ng-template #loading></ng-template>
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; }

    .handoff {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: #f7f4e8;
      background:
        linear-gradient(135deg, rgba(8, 38, 29, .94), rgba(26, 67, 52, .88)),
        url('/assets/checkpoint_bg/waterfall.jpg') center / cover;
    }

    .panel {
      width: min(100%, 440px);
      padding: 32px;
      border: 1px solid rgba(247, 244, 232, .25);
      border-radius: 8px;
      background: rgba(8, 38, 29, .78);
      box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
    }

    .eyebrow {
      margin: 0 0 12px;
      color: #d7e8bd;
      font-size: .78rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    h1 { margin: 0; font-size: clamp(1.8rem, 7vw, 2.5rem); line-height: 1.08; }
    .message { margin: 16px 0 24px; line-height: 1.55; color: #e4ead8; }

    .primary-action {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 14px 18px;
      border-radius: 6px;
      border: 0;
      color: #102b1f;
      background: #d7e8bd;
      font: inherit;
      font-weight: 800;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
    }

    .hint { margin: 20px 0 0; color: #d5dfca; font-size: .92rem; line-height: 1.5; }
  `]
})
export class OpenBrowserComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly userAgent = this.browser ? navigator.userAgent : '';

  readonly isIos = signal(/iPhone|iPad|iPod/i.test(this.userAgent));
  readonly isAndroid = signal(/Android/i.test(this.userAgent));
  readonly inAppBrowser = signal(/FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger/i.test(this.userAgent));
  readonly showHandoff = computed(() => !this.browser || this.inAppBrowser());
  readonly appName = computed(() => {
    if (/Line\//i.test(this.userAgent)) return 'LINE';
    if (/FBAN|FBAV/i.test(this.userAgent)) return 'Facebook';
    if (/MicroMessenger/i.test(this.userAgent)) return 'Messenger';
    return 'this app';
  });
  readonly destination = this.getDestination();
  readonly browserLink = computed(() => this.isAndroid() ? this.androidChromeLink() : this.destination);

  async copyLink(): Promise<void> {
    if (!this.browser) return;

    try {
      await navigator.clipboard.writeText(this.destination);
      window.alert('Link copied. Open Safari and paste the link into the address bar.');
    } catch {
      window.prompt('Copy this link and open it in Safari:', this.destination);
    }
  }

  constructor() {
    if (this.browser && !this.inAppBrowser()) {
      window.location.replace(this.destination);
    }
  }

  private getDestination(): string {
    const requested = this.route.snapshot.queryParamMap.get('next');
    const path = requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : '/login';

    return this.browser ? new URL(path, window.location.origin).toString() : path;
  }

  private androidChromeLink(): string {
    const target = new URL(this.destination);
    return `intent://${target.host}${target.pathname}${target.search}${target.hash}`
      + `#Intent;scheme=${target.protocol.replace(':', '')};package=com.android.chrome;end`;
  }
}
