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
 *
 * The atmosphere is built from gradients and transforms rather than images: it has to feel
 * like standing under a canopy without costing a megabyte of artwork on mobile data, and the
 * animation has to stay on the compositor because this phone will shortly be holding a GPS
 * watch open for an hour.
 */
@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="portal">
      <!-- Dappled light: three slow drifting pools, no blur filters, no images. -->
      <div class="canopy" aria-hidden="true">
        <span class="dapple dapple-1"></span>
        <span class="dapple dapple-2"></span>
        <span class="dapple dapple-3"></span>
      </div>

      <!-- Treeline silhouette along the bottom edge. -->
      <svg class="treeline" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,120 L0,74 C60,62 90,88 140,70 C190,52 215,80 265,66 C320,50 345,84 400,68
                 C455,52 480,86 540,70 C600,54 625,88 685,72 C745,56 770,90 830,74
                 C890,58 915,88 975,72 C1035,56 1060,86 1120,70 C1180,54 1205,84 1265,68
                 C1325,52 1360,80 1440,66 L1440,120 Z" />
      </svg>

      <header class="portal-head">
        <p class="eyebrow u-rise" style="animation-delay:60ms">
          {{ lang() === 'th' ? 'ชินรินโยกุ · การอาบป่า' : 'Shinrin-yoku · Forest bathing' }}
        </p>
        <h1 class="portal-title u-rise" style="animation-delay:140ms">
          {{ lang() === 'th' ? 'เลือกสถานที่' : 'Choose a location' }}
        </h1>
        <p class="portal-sub u-rise" style="animation-delay:220ms">
          {{ lang() === 'th'
            ? 'เลือกเส้นทางอาบป่าที่คุณกำลังจะไป หรือสแกน QR ที่ทางเข้าสถานที่'
            : 'Pick the trail you are visiting, or scan the QR code at its entrance.' }}
        </p>
      </header>

      <ul class="site-grid">
        @for (site of sites; track site.slug; let i = $index) {
          <li class="site-cell u-rise" [style.animation-delay]="320 + i * 110 + 'ms'">
            <button
              type="button"
              class="site-card"
              [class.is-locked]="!isOpen(site)"
              [style.--card-primary]="site.theme.primary"
              [style.--card-surface]="site.theme.surface"
              [attr.aria-disabled]="!isOpen(site)"
              (click)="choose(site)">

              <span class="card-media">
                <img class="card-photo" [src]="site.image" [alt]="text(site.name)" loading="lazy" decoding="async" />
                <span class="card-shade" aria-hidden="true"></span>
                <svg class="card-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path d="M40 8c-14 0-24 7-26 18-1 5 0 9 2 12l-5 5a1.5 1.5 0 1 0 2 2l5-5c3 2 7 3 12 2C41 40 40 22 40 8Z"
                        fill="currentColor" opacity=".92" />
                  <path d="M34 15C26 22 20 30 16 39" stroke="#fff" stroke-width="2"
                        stroke-linecap="round" fill="none" opacity=".7" />
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

                @if (isOpen(site)) {
                  <span class="card-go">
                    {{ lang() === 'th' ? 'เริ่มเส้นทางนี้' : 'Start this trail' }}
                    <svg class="go-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"
                            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                }
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
      position: relative;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 36px 16px 64px;
      overflow: hidden;
      /* The shared forest backdrop shows through; no second scene here. */
      background: transparent;
      isolation: isolate;
    }

    /* ---- atmosphere ------------------------------------------------ */

    .canopy, .treeline { display: none; }

    .canopy {
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
    }

    .dapple {
      position: absolute;
      border-radius: 50%;
      /* A soft pool of light. Radial gradients keep this blur-free, which matters:
         an animated filter: blur() repaints every frame on a phone. */
      background: radial-gradient(circle closest-side,
        var(--c-dapple, rgba(253, 230, 138, .38)) 0%,
        rgba(253, 230, 138, .14) 48%,
        transparent 72%);
      will-change: transform;
    }

    .dapple-1 {
      width: 62vmax; height: 62vmax;
      top: -22vmax; inset-inline-start: -16vmax;
      animation: forest-drift var(--t-drift, 22s) var(--ease-soft, ease-in-out) infinite;
    }

    .dapple-2 {
      width: 48vmax; height: 48vmax;
      top: 18vmax; inset-inline-end: -18vmax;
      background: radial-gradient(circle closest-side,
        rgba(134, 239, 172, .34) 0%, rgba(134, 239, 172, .12) 50%, transparent 74%);
      animation: forest-drift calc(var(--t-drift, 22s) * 1.45) var(--ease-soft, ease-in-out) infinite reverse;
    }

    .dapple-3 {
      width: 40vmax; height: 40vmax;
      bottom: -14vmax; inset-inline-start: 24%;
      background: radial-gradient(circle closest-side,
        rgba(34, 165, 90, .20) 0%, rgba(34, 165, 90, .07) 52%, transparent 76%);
      animation: forest-drift calc(var(--t-drift, 22s) * 1.9) var(--ease-soft, ease-in-out) infinite;
    }

    .treeline {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      width: 100%;
      height: 86px;
      z-index: -1;
      fill: var(--c-canopy, #0f3d24);
      opacity: .07;
      pointer-events: none;
    }

    /* ---- header ----------------------------------------------------- */

    .portal-head {
      position: relative;
      max-width: 1120px;
      margin: 0 auto 30px;
      text-align: center;
    }

    .eyebrow {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--c-moss, #15803d);
      opacity: .9;
    }

    .portal-title {
      margin: 0 0 10px;
      text-shadow: 0 1px 0 rgba(255, 255, 255, .7);
      font-family: var(--f-head);
      font-size: 30px;
      font-weight: 700;
      line-height: 1.2;
      color: var(--c-forest, #14532d);
    }

    .portal-sub {
      margin: 0 auto;
      max-width: 46ch;
      font-size: 15px;
      line-height: 1.7;
      color: var(--c-stone, #4a5b52);
    }

    /* ---- cards ------------------------------------------------------ */

    .site-grid {
      position: relative;
      list-style: none;
      margin: 0 auto;
      padding: 0;
      max-width: 1120px;
      display: grid;
      /* Grid gap is safe well before flex gap was (iOS 10.3 vs 14.1). */
      gap: 18px;
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
      background: var(--c-paper, #fff);
      border: 1px solid var(--c-line, #d8e5dc);
      border-radius: var(--r-lg, 20px);
      box-shadow: var(--shadow-rest);
      cursor: pointer;
      transition:
        transform var(--t-base, 280ms) var(--ease-settle),
        box-shadow var(--t-base, 280ms) var(--ease-settle),
        border-color var(--t-base, 280ms) var(--ease-settle);
    }

    .site-card:hover,
    .site-card:focus-visible {
      transform: translate3d(0, -4px, 0);
      border-color: var(--card-primary, var(--c-moss));
      box-shadow: var(--shadow-lift);
    }

    .site-card:active { transform: translate3d(0, -1px, 0); }

    .site-card.is-locked { cursor: default; }
    .site-card.is-locked .card-glyph { opacity: .7; }
    .site-card.is-locked:hover { transform: none; box-shadow: var(--shadow-rest); }

    .card-media {
      position: relative;
      display: block;
      overflow: hidden;
      background:
        radial-gradient(circle at 76% 22%, rgba(255, 255, 255, .7), transparent 58%),
        var(--card-surface, var(--c-morning, #e8f3ec));
    }

    .card-media::before {
      content: '';
      display: block;
      padding-top: 52%;
    }

    /* Real photo of the trail, darkened at the bottom so the leaf badge stays legible. */
    .card-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform var(--t-slow, 520ms) var(--ease-settle);
    }
    .site-card:hover .card-photo { transform: scale(1.05); }
    .site-card.is-locked .card-photo { filter: saturate(.55); }

    .card-shade {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(10, 31, 20, 0) 40%, rgba(10, 31, 20, .62) 100%);
    }

    .card-glyph {
      position: absolute;
      bottom: 12px;
      inset-inline-start: 14px;
      width: 44px; height: 44px;
      padding: 8px;
      box-sizing: border-box;
      border-radius: 50%;
      background: rgba(255, 253, 247, .94);
      box-shadow: 0 4px 14px rgba(0, 0, 0, .25);
      color: var(--card-primary, var(--c-moss, #15803d));
      transform-origin: 50% 85%;
      animation: forest-sway 7s var(--ease-soft, ease-in-out) infinite;
    }

    /* Each card's leaf drifts on its own clock, so the row does not pulse in unison. */
    .site-cell:nth-child(2) .card-glyph { animation-duration: 8.5s; animation-delay: -2s; }
    .site-cell:nth-child(3) .card-glyph { animation-duration: 9.5s; animation-delay: -4s; }

    .card-badge {
      position: absolute;
      top: 12px;
      inset-inline-end: 12px;
      padding: 5px 12px;
      border-radius: var(--r-pill, 999px);
      background: rgba(15, 61, 36, .84);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .02em;
    }

    .card-body {
      display: block;
      padding: 18px 20px 20px;
      border-top: 3px solid var(--card-primary, var(--c-moss));
    }

    .card-name {
      display: block;
      font-family: var(--f-head);
      font-size: 20px;
      font-weight: 700;
      color: var(--c-forest, #14532d);
    }

    .card-area {
      display: block;
      margin-top: 3px;
      font-size: 13px;
      font-weight: 600;
      color: var(--card-primary, var(--c-moss));
    }

    .card-summary {
      display: block;
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--c-stone, #4a5b52);
    }

    .card-stats {
      display: flex;
      margin-top: 15px;
      padding-top: 13px;
      border-top: 1px solid var(--c-line, #d8e5dc);
    }

    /* Margin rather than flex gap, so the row does not collapse on iOS below 14.1. */
    .stat + .stat { margin-inline-start: 22px; }

    .stat strong {
      font-size: 17px;
      font-weight: 800;
      color: var(--c-forest, #14532d);
    }

    .stat small {
      margin-inline-start: 4px;
      font-size: 12px;
      color: var(--c-pebble, #8a9a91);
    }

    .card-go {
      display: flex;
      align-items: center;
      margin-top: 14px;
      font-size: 14px;
      font-weight: 700;
      color: var(--card-primary, var(--c-moss));
    }

    .go-arrow {
      width: 16px;
      height: 16px;
      margin-inline-start: 7px;
      transition: transform var(--t-base, 280ms) var(--ease-settle);
    }

    .site-card:hover .go-arrow,
    .site-card:focus-visible .go-arrow {
      transform: translate3d(4px, 0, 0);
    }

    /* ---- notice ------------------------------------------------------ */

    .portal-notice {
      position: relative;
      max-width: 1120px;
      margin: 20px auto 0;
      padding: 13px 18px;
      border-radius: var(--r-md, 14px);
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: var(--c-warn, #b45309);
      font-size: 14px;
      text-align: center;
      animation: forest-rise var(--t-base, 280ms) var(--ease-settle) both;
    }

    @media (min-width: 760px) {
      .portal { padding: 56px 24px 80px; }
      .eyebrow { font-size: 13px; }
      .portal-title { font-size: 40px; }
      .portal-sub { font-size: 16px; }
      .site-grid { grid-template-columns: repeat(3, 1fr); gap: 22px; }
      .treeline { height: 130px; }
    }

    /* The ambient drift is decoration; stop it entirely rather than merely shortening it. */
    @media (prefers-reduced-motion: reduce) {
      .dapple, .card-glyph { animation: none; }
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
