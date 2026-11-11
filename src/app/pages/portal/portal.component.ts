import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { Site } from '../../config/sites.config';
import { LanguageService } from '../../services/language.service';
import { SiteService } from '../../services/site.service';

/**
 * Landing page for choosing a forest-bathing location.
 *
 * Most visitors should never see this: they arrive at a trail and scan the QR code at the
 * entrance, which goes straight to /s/<slug>. The portal is for everyone else — someone
 * opening the site at home, or coming back to look at a certificate from another trail.
 */
@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="portal">
      <header class="portal-head">
        <h1 class="portal-title">{{ lang() === 'th' ? 'เลือกสถานที่' : 'Choose a location' }}</h1>
        <p class="portal-sub">
          {{ lang() === 'th'
            ? 'เลือกเส้นทางอาบป่าที่คุณกำลังจะไป หรือสแกน QR ที่ทางเข้าสถานที่'
            : 'Pick the trail you are visiting, or scan the QR code at its entrance.' }}
        </p>
      </header>

      <ul class="site-grid">
        @for (site of sites; track site.slug) {
          <li class="site-cell">
            <button
              type="button"
              class="site-card"
              [class.is-locked]="!isOpen(site)"
              [style.--card-primary]="site.theme.primary"
              [style.--card-surface]="site.theme.surface"
              [attr.aria-disabled]="!isOpen(site)"
              (click)="choose(site)">

              <span class="card-media">
                <!--
                  A themed panel rather than a photo. The only artwork available is the trail
                  poster, which is 2.4MB and crops to a near-empty patch of sky at card size —
                  three of those would be 7MB of mobile data to render the chooser.
                -->
                <svg class="card-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path d="M40 8c-14 0-24 7-26 18-1 5 0 9 2 12l-5 5a1.5 1.5 0 1 0 2 2l5-5c3 2 7 3 12 2C41 40 40 22 40 8Z"
                        fill="currentColor" opacity=".9" />
                  <path d="M34 15C26 22 20 30 16 39" stroke="#fff" stroke-width="2"
                        stroke-linecap="round" fill="none" opacity=".75" />
                </svg>
                @if (!isOpen(site)) {
                  <span class="card-badge">{{ lang() === 'th' ? 'เร็ว ๆ นี้' : 'Coming soon' }}</span>
                }
              </span>

              <span class="card-body">
                <span class="card-name">{{ text(site.name) }}</span>
                <span class="card-area">{{ text(site.area) }}</span>
                <span class="card-summary">{{ text(site.summary) }}</span>

                <span class="card-stats" [attr.aria-label]="lang() === 'th' ? 'ข้อมูลเส้นทาง' : 'Trail details'">
                  <span class="stat">
                    <strong>{{ site.stats.checkpoints }}</strong>
                    <small>{{ lang() === 'th' ? 'จุด' : 'stops' }}</small>
                  </span>
                  <span class="stat">
                    <strong>{{ site.stats.distanceKm }}</strong>
                    <small>{{ lang() === 'th' ? 'กม.' : 'km' }}</small>
                  </span>
                  <span class="stat">
                    <strong>{{ site.stats.minutes }}</strong>
                    <small>{{ lang() === 'th' ? 'นาที' : 'min' }}</small>
                  </span>
                </span>
              </span>
            </button>
          </li>
        }
      </ul>

      @if (notice()) {
        <p class="portal-notice" role="status">{{ notice() }}</p>
      }
    </section>
  `,
  styles: [`
    .portal {
      min-height: 100vh;
      box-sizing: border-box;
      padding: 28px 16px 48px;
      background: linear-gradient(180deg, #f8fafc 0%, #eef5f0 100%);
    }

    .portal-head {
      max-width: 1100px;
      margin: 0 auto 24px;
      text-align: center;
    }

    .portal-title {
      margin: 0 0 8px;
      font-size: 26px;
      font-weight: 800;
      color: #14532d;
    }

    .portal-sub {
      margin: 0 auto;
      max-width: 48ch;
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
    }

    .site-grid {
      list-style: none;
      margin: 0 auto;
      padding: 0;
      max-width: 1100px;
      display: grid;
      /* Grid gap is safe well before flex gap was (iOS 10.3 vs 14.1). */
      gap: 16px;
      grid-template-columns: 1fr;
    }

    .site-cell { display: block; }

    .site-card {
      -webkit-appearance: none;
      appearance: none;
      display: block;
      width: 100%;
      padding: 0;
      margin: 0;
      overflow: hidden;
      text-align: start;
      background: #fff;
      border: 2px solid transparent;
      border-radius: 16px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }

    .site-card:hover,
    .site-card:focus-visible {
      border-color: var(--card-primary, #15803d);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
      transform: translateY(-2px);
      outline: none;
    }

    .site-card:active { transform: translateY(0); }

    .site-card.is-locked { cursor: default; }
    .site-card.is-locked .card-media { filter: grayscale(0.55); }

    .card-media {
      position: relative;
      display: block;
      background:
        radial-gradient(circle at 78% 18%, rgba(255, 255, 255, .55), transparent 55%),
        var(--card-surface, #f0fdf4);
    }

    .card-media::before {
      content: '';
      display: block;
      padding-top: 42%;
    }

    .card-glyph {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 68px;
      height: 68px;
      margin: -34px 0 0 -34px;   /* centring that predates transform support concerns */
      color: var(--card-primary, #15803d);
      opacity: .85;
    }

    .card-badge {
      position: absolute;
      top: 10px;
      inset-inline-end: 10px;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(15, 23, 42, .82);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }

    .card-body {
      display: block;
      padding: 16px 18px 18px;
      border-top: 4px solid var(--card-primary, #15803d);
    }

    .card-name {
      display: block;
      font-size: 19px;
      font-weight: 800;
      color: #0f172a;
    }

    .card-area {
      display: block;
      margin-top: 2px;
      font-size: 13px;
      font-weight: 600;
      color: var(--card-primary, #15803d);
    }

    .card-summary {
      display: block;
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.55;
      color: #475569;
    }

    .card-stats {
      display: flex;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
    }

    /* Margin rather than flex gap, so the row does not collapse on iOS below 14.1. */
    .stat + .stat { margin-inline-start: 22px; }

    .stat strong {
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
    }

    .stat small {
      margin-inline-start: 4px;
      font-size: 12px;
      color: #64748b;
    }

    .portal-notice {
      max-width: 1100px;
      margin: 18px auto 0;
      padding: 12px 16px;
      border-radius: 12px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
      font-size: 14px;
      text-align: center;
    }

    @media (min-width: 720px) {
      .portal { padding: 40px 24px 56px; }
      .portal-title { font-size: 32px; }
      .site-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .site-card { transition: none; }
      .site-card:hover, .site-card:focus-visible, .site-card:active { transform: none; }
    }
  `],
})
export class PortalComponent {
  private readonly siteService = inject(SiteService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);

  readonly sites = this.siteService.all;
  readonly lang = computed(() => this.languageService.currentLanguage().code);

  /** Message shown when someone taps a trail that has no content yet. */
  readonly notice = signal('');

  isOpen(site: Site): boolean {
    return this.siteService.isOpen(site);
  }

  /** Pick the string for the active language. */
  text(value: { th: string; en: string }): string {
    return this.lang() === 'th' ? value.th : value.en;
  }

  choose(site: Site): void {
    if (!this.isOpen(site)) {
      this.notice.set(this.lang() === 'th'
        ? `เส้นทาง${site.name.th}ยังจัดเตรียมไม่เสร็จ กรุณาเลือกสถานที่อื่นก่อน`
        : `The ${site.name.en} trail is not ready yet. Please choose another location for now.`);
      return;
    }

    this.notice.set('');
    if (this.siteService.select(site.slug)) {
      void this.router.navigate(['/home']);
    }
  }
}
