import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CertificateStatsStorage, StorageService } from '../../services/storage.service';
import { LanguageService } from '../../services/language.service';
import { LocationTrackingService, TrackedPoint } from '../../services/location-tracking.service';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * How a certificate download/share attempt ended:
 * - 'delivered': the file reached the user (download started / share sheet completed)
 * - 'failed': nothing was delivered; user progress must be kept
 */
type CertificateDeliveryResult = 'delivered' | 'failed';

/** A4 landscape at 96dpi. The certificate is always laid out at this size, then scaled. */
const CERT_EXPORT_WIDTH_PX = 1122;

/** Minimal shapes of the lazily imported render libraries (kept loose on purpose). */
type Html2CanvasFn = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
type JsPdfCtor = new (options?: Record<string, unknown>) => any;

/** A certificate rendered once and reused, so a tap can share it without re-rendering. */
interface PreparedCertificate {
  pngBlob: Blob;
  pngDataUrl: string;
  fileBaseName: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-certificate',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="cert-page" [class.preview-mode]="isPreviewMode">
      <!-- <div class="toolbar">
        <div class="name-input-group">
          <label class="name-label">{{ t().certificatePage.recipientNameLabel }}:</label>
          <input class="name" type="text" [(ngModel)]="userName" [placeholder]="t().certificatePage.recipientNamePlaceholder" (change)="saveName()"/>
        </div>

        <button class="btn" (click)="downloadPng()">{{ t().certificatePage.downloadPng }}</button>
        <button class="btn" (click)="downloadPdf()">{{ t().certificatePage.downloadPdf }}</button>
        <span class="time">{{durationText}}</span>
      </div> -->

      <div class="cert-stage" #certStage>
      <div id="certificate" class="certificate">
        <div class="cert-bg">
          <div class="cert-content">
            <div class="top">
              <div class="top-logos" aria-label="Certificate partner logos">
                <img class="top-logo" src="/assets/images/Thaksin-logo.png" alt="Thaksin" />
                <img class="top-logo" src="/assets/images/kachonglogo.png" alt="Kachong Hills" />
                <img class="top-logo" src="/assets/images/Garden-logo.png" alt="Garden" />
              </div>
              <div class="kachong-name">{{ t().certificatePage.resortNameLine1 }}</div>
              <div class="kachong-sub">{{ t().certificatePage.resortNameLine2 }}</div>
            </div>

            <h1 class="cert-title" [class.th-title]="currentLang() === 'th'">
              <span>{{ t().certificatePage.titleLine1 }} {{ t().certificatePage.titleLine2 }}</span>
            </h1>

            <div class="certify">{{ t().certificatePage.certifyLine }}</div>

            <div class="recipient">
              <div class="recipient-name">{{ userName || '________________' }}</div>
            </div>

            <div class="completion">
              <span>{{ t().certificatePage.completionLine1 }}</span>
              <span>{{ t().certificatePage.completionLine2 }}</span>
            </div>

            <div class="stats" aria-label="Certificate stats">
              <div class="stat">
                <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 1.75a10.25 10.25 0 1 0 0 20.5a10.25 10.25 0 0 0 0-20.5Zm0 2a8.25 8.25 0 1 1 0 16.5a8.25 8.25 0 0 1 0-16.5Zm.75 4.25a.75.75 0 0 0-1.5 0v4.6c0 .26.14.5.37.64l3.2 1.92a.75.75 0 1 0 .77-1.28l-2.84-1.7V8Z" />
                </svg>
                <div class="stat-text">{{ durationMinutes() | number }} {{ t().certificatePage.statTimeSuffix }}</div>
              </div>
              <div class="stat-divider" aria-hidden="true"></div>
              <div class="stat">
                <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M9.2 11.2c-1.4 0-2.6 1.6-2.6 3.5S7.8 18 9.2 18s2.6-1.6 2.6-3.3-1.2-3.5-2.6-3.5Zm0 4.8c-.6 0-1.2-.8-1.2-1.9s.6-1.9 1.2-1.9 1.2.8 1.2 1.9S9.8 16 9.2 16Z" />
                  <path fill="currentColor" d="M14.8 6c-1.5 0-2.8 1.8-2.8 4s1.3 4 2.8 4 2.8-1.8 2.8-4-1.3-4-2.8-4Zm0 6c-.7 0-1.3-1-1.3-2.2S14.1 7.6 14.8 7.6s1.3 1 1.3 2.2S15.5 12 14.8 12Z" />
                  <path fill="currentColor" d="M7.5 18.2c-.7.2-1.3.7-1.6 1.4-.2.6-.1 1.2.2 1.7.4.6 1.1.9 1.8.7.7-.2 1.2-.7 1.5-1.3.2-.6.2-1.2-.2-1.8-.4-.6-1.1-.9-1.7-.7Zm.7 2c-.1.3-.4.6-.7.7-.2.1-.4 0-.6-.2-.1-.2-.2-.4-.1-.6.1-.3.4-.6.7-.7.2-.1.4 0 .6.2.2.2.2.4.1.6Z" />
                  <path fill="currentColor" d="M17.1 13.6c-.8.2-1.4.8-1.7 1.6-.2.7-.1 1.3.3 1.9.4.6 1.1 1 1.8.8.8-.2 1.4-.8 1.7-1.6.2-.7.1-1.3-.3-1.9-.4-.6-1.1-1-1.8-.8Zm.8 2.2c-.1.4-.5.7-.8.8-.2.1-.5 0-.6-.2-.2-.2-.2-.5-.1-.7.1-.4.5-.7.8-.8.2-.1.5 0 .6.2.2.2.2.5.1.7Z" />
                </svg>
                <div class="stat-text">{{ totalSteps | number }} {{ t().certificatePage.statStepsSuffix }}</div>
              </div>
              <div class="stat-divider" aria-hidden="true"></div>
              <div class="stat">
                <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M20.75 3.25h-.9C11.7 3.25 5.25 9.7 5.25 17.85V21a.75.75 0 0 0 .75.75h3.15c8.15 0 14.6-6.45 14.6-14.6v-3.1a.8.8 0 0 0-.24-.56a.8.8 0 0 0-.56-.24Zm1.5 3.9c0 7.32-5.83 13.1-13.1 13.1H6.75v-2.4C6.75 10.58 12.58 4.75 19.85 4.75h2.4v2.4Z" />
                  <path fill="currentColor" d="M9.2 19.2a.75.75 0 0 1-.53-1.28l7.6-7.6a.75.75 0 1 1 1.06 1.06l-7.6 7.6a.75.75 0 0 1-.53.22Z" />
                </svg>
                <div class="stat-text">{{ t().certificatePage.statPhytoncideLabel }} {{ totalPythaside | number }}</div>
              </div>
            </div>

            <div class="stats stats-more" aria-label="Additional stats">
              <div class="stat">
                <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M13 2s-2 2.5-2 5a3 3 0 0 0 6 0c0-2.5-4-5-4-5Zm-6.5 9.5c-2.2 2.2-2.2 5.8 0 8s5.8 2.2 8 0c.9-.9 1.5-2 1.7-3.2-3.4 1.5-7.5.8-9.7-1.4-2.2-2.2-2.9-5.7-1.4-9.1-.7.2-1.9.8-2.6 1.7Z" />
                </svg>
                <div class="stat-text">{{ t().certificatePage.statCaloriesLabel }} {{ totalCalories | number }}</div>
              </div>
              <div class="stat-divider" aria-hidden="true"></div>

              <div class="stat">
                <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 3c-3.2 4.2-5 7.6-5 10a5 5 0 0 0 10 0c0-2.4-1.8-5.8-5-10Zm0 16a3 3 0 0 1-3-3c0-1.6 1.2-3.8 3-6.4 1.8 2.6 3 4.8 3 6.4a3 3 0 0 1-3 3Z" />
                </svg>
                <div class="stat-text">{{ t().certificatePage.statOxygenLabel }} {{ totalOxygen }}</div>
              </div>
            </div>

            <div class="bottom">
              <div></div>

              <div class="signer">
                <img class="sign-img" src="/assets/images/sign.png" alt="" aria-hidden="true" />
                <div class="sign-name">{{ t().certificatePage.signerName }}</div>
                <div class="sign-title">{{ t().certificatePage.signerTitle }}</div>
              </div>

              <div class="issued">
                <div class="issued-value">{{ completedDate }}</div>
                <div class="issued-label">{{ t().certificatePage.issueDate }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div class="cert-actions" *ngIf="!isPreviewMode">
        <p class="save-hint">
          {{ canShareFiles ? t().certificatePage.saveHintShare : t().certificatePage.saveHintDownload }}
        </p>
        <p class="save-error" *ngIf="saveState === 'error'">{{ t().certificatePage.saveFailed }}</p>

        <div class="action-row">
          <button type="button" class="act act-primary" (click)="saveCertificate()" [disabled]="saveState === 'working'">
            <span *ngIf="saveState === 'working'">{{ t().certificatePage.savingLabel }}</span>
            <span *ngIf="saveState !== 'working'">{{ t().certificatePage.saveButton }}</span>
          </button>
          <button type="button" class="act act-secondary" (click)="downloadPdf()" [disabled]="saveState === 'working'">
            {{ t().certificatePage.downloadPdf }}
          </button>
          <button type="button" class="act act-secondary" (click)="shareCertificateWithCoordinates()" [disabled]="saveState === 'working'">
            {{ t().certificatePage.shareButton }}
          </button>
          <button type="button" class="act act-secondary" (click)="goToStressQuestionnaire()" [disabled]="saveState === 'working'">
            {{ t().certificatePage.stressCheckButton }}
          </button>
          <button type="button" class="act act-finish" (click)="finishRun()" *ngIf="readyToFinish()">
            {{ t().certificatePage.finishButton }}
          </button>
        </div>

        @if (savedImageUrl) {
          <div class="save-fallback">
            <p class="save-fallback-hint">{{ t().certificatePage.pressAndHoldHint }}</p>
            <img class="save-fallback-image" [src]="savedImageUrl" alt="" />
          </div>
        }

        @if (pdfFallbackUrl) {
          <div class="pdf-dialog-backdrop" role="presentation">
            <section class="pdf-dialog" role="dialog" aria-modal="true" [attr.aria-label]="t().certificatePage.pdfSaveTitle">
              <h2>{{ t().certificatePage.pdfSaveTitle }}</h2>
              <p>{{ t().certificatePage.pdfSaveInstructions }}</p>
              <div class="pdf-dialog-actions">
                <a class="act act-primary pdf-open-button" [href]="pdfFallbackUrl" target="_blank" rel="noopener">
                  {{ t().certificatePage.openPdf }}
                </a>
                <button type="button" class="act act-secondary" (click)="closePdfFallback()">
                  {{ t().certificatePage.closePdf }}
                </button>
              </div>
            </section>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    .cert-page {
      max-height: calc(100dvh - 64px);
      padding: 20px;
      background: #f7f8f0;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .cert-page.preview-mode {
      min-height: auto;
      padding: 0;
      background: transparent;
      gap: 0;
    }

    .cert-page.preview-mode .cert-stage {
      margin: 0 auto;
      max-width: none;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,.06);
    }

    .name-input-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1 1 300px;
      max-height: 48px;
    }

    .name-label {
      font-weight: 700;
      color: #13241a;
      white-space: nowrap;
      font-size: 15px;
    }

    .name {
      flex: 1;
      min-width: 120px;
      max-width: 250px;
      border: 2px solid #dbe3d0;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 16px;
      font-weight: 600;
      background: #fff;
      transition: all 0.3s ease;
    }

    .name:focus {
      outline: none;
      border-color: #1f6b3a;
      box-shadow: 0 0 0 4px rgba(31, 107, 58, 0.15);
      background: #f8f7ff;
    }

    .btn {
      border: 2px solid #c6d3bf;
      background: white;
      padding: 12px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      color: #13241a;
    }

    .btn:hover {
      background: linear-gradient(135deg, #1f6b3a, #5a67d8);
      border-color: #1f6b3a;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(31, 107, 58, 0.3);
    }

    .btn:active {
      transform: translateY(0);
    }

    .time {
      color: #55695c;
      font-weight: 700;
      font-size: 16px;
      white-space: nowrap;
      padding: 8px 16px;
      background: #edf1e4;
      border-radius: 8px;
    }

    /*
      The certificate is laid out once at export size (A4 landscape at 1122x794 CSS px) and
      then scaled to whatever width it has been given, so what the user sees is exactly what
      gets saved — on a phone, a tablet or a desktop. Previously the preview reflowed to a
      tall mobile layout while the export stayed landscape, so the two never matched.

      The ::before padding trick reserves the right height instead of 'aspect-ratio', which
      iOS Safari only understands from 15 onwards.
    */
    .cert-stage {
      position: relative;
      width: 100%;
      max-width: 1122px;
      margin: 0 auto 16px;
      overflow: hidden;

      /*
        The scale is derived in CSS so the certificate fits without waiting on any script —
        calc() with vw works on every iOS version we support, whereas ResizeObserver does not
        exist before 13.4. startStageScaling() overwrites this with an exact measurement when
        it can; the few pixels of slack here just keep a desktop scrollbar from causing a clip.
        .cert-page's padding is 20px either side (12px under 768px, see the media query).
      */
      --cert-scale: calc((100vw - 44px) / 1122);
    }

    @media (max-width: 768px) {
      .cert-stage { --cert-scale: calc((100vw - 24px) / 1122); }
    }

    @media (min-width: 1166px) {
      .cert-stage { --cert-scale: 1; }
    }

    /* Inside the summary page's preview iframe the stage spans the full viewport. */
    .cert-page.preview-mode .cert-stage {
      --cert-scale: calc(100vw / 1122);
    }

    .cert-stage::before {
      content: '';
      display: block;
      padding-top: 70.7665%;   /* 794 / 1122 */
    }

    .certificate {
      position: absolute;
      top: 0;
      left: 0;
      width: 1122px;
      height: 794px;
      max-width: none;
      transform-origin: top left;
      transform: scale(var(--cert-scale, 1));
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      padding: 0;
      box-sizing: border-box;
    }

    /*
      Exporting mode: force stable A4-ish pixel sizing and fixed typography.
      This avoids viewport-dependent vw clamps (common cause of “download looks different”).
    */
    /*
      Applied to the off-screen clone that html2canvas captures (see renderCertificateCanvas):
      true A4 size, and no preview scaling, since html2canvas reads the element's transform.
    */
    .certificate.exporting {
      transform: none !important;
      position: static !important;
      width: 1122px !important;
      height: 794px !important;
      max-width: none !important;
    }

    .certificate.exporting .cert-content {
      /* Slightly tighter bottom padding to reduce excess whitespace in exports */
      padding: 54px 66px 42px !important;
    }
    .certificate.exporting .top-logo { height: 64px !important; }
    .certificate.exporting .cert-title { font-size: 40px !important; }
    .certificate.exporting .certify { font-size: 18px !important; }
    .certificate.exporting .recipient-name { font-size: 46px !important; }
    .certificate.exporting .completion { font-size: 18px !important; }
    .certificate.exporting .stat-icon { width: 28px !important; height: 28px !important; }
    .certificate.exporting .stat-text { font-size: 14px !important; }
    .certificate.exporting .sign-img {
      height: 42px !important;
      margin: 0 auto 0 !important;
    }
    .certificate.exporting .sign-name { font-size: 15px !important; }
    .certificate.exporting .sign-title { font-size: 12px !important; margin-top: 0 !important; }

    /*
      Mobile viewports switch stats/bottom layout to a single column via @media rules.
      When exporting we want the fixed A4 layout regardless of viewport size.
    */
    .certificate.exporting .stats {
      // grid-template-columns: 1fr auto 1fr auto 1fr !important;
      gap: 10px !important;
    }

    .certificate.exporting .stats-more {
      // grid-template-columns: 1fr auto 1fr !important;
      gap: 10px !important;
    }

    .certificate.exporting .stat-divider {
      display: block !important;
      width: 1px !important;
      height: 42px !important;
    }

    .certificate.exporting .bottom {
      display: grid !important;
      grid-template-columns: 1fr auto 1fr !important;
      align-items: flex-end !important;
      gap: 16px !important;
    }

    .certificate.exporting .signer {
      text-align: center !important;
      justify-self: center !important;
      min-width: 260px !important;
    }

    .certificate.exporting .issued {
      text-align: right !important;
      justify-self: end !important;
      min-width: 160px !important;
    }

    .cert-bg {
      width: 100%;
      height: 100%;
      background: url('/assets/images/certificateBG.png') no-repeat center / cover;
      box-sizing: border-box;
      position: relative;
    }

    .cert-content {
      position: absolute;
      inset: 0;
      padding: 54px 66px 42px;
      box-sizing: border-box;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      color: #13241a;
    }

    .top {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 6px;
    }

    .top > * + * {
      margin-top: 6px;
    }

    .top-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap;
    }

    .top-logos > * + * {
      margin-left: 14px;
    }

    .top-logo {
      height: 64px;
      width: auto;
      object-fit: contain;
    }

    .kachong-name {
      font-weight: 800;
      letter-spacing: 1.2px;
      color: #a16207;
      font-size: 16px;
      text-transform: uppercase;
    }

    .kachong-sub {
      font-weight: 700;
      letter-spacing: 1.2px;
      color: #a16207;
      font-size: 12px;
      text-transform: uppercase;
      margin-top: -6px;
    }

    .cert-title {
      margin: 0;
      font-size: 40px;
      line-height: 1.05;
      letter-spacing: 1px;
      color: #a16207;
      font-weight: 900;
      font-family: 'Georgia', serif;
      text-transform: uppercase;
      display: grid;
      gap: 6px;
      justify-items: center;
    }

    .cert-title:not(.th-title) {
      white-space: nowrap;
    }

    .cert-title.th-title {
      letter-spacing: 0px;
      gap: 0;
    }

    .certify {
      margin-top: 8px;
      color: #2a3d31;
      font-weight: 600;
      font-size: 18px;
      font-family: 'Georgia', serif;
    }

    .recipient {
      padding-top: 4px;
    }

    .recipient-name {
      margin: 0 auto;
      font-size: 46px;
      font-weight: 900;
      border-bottom: 2px solid rgba(10, 31, 20, 0.35);
      padding-bottom: 10px;
      width: 88%;
      max-width: 720px;
      word-wrap: break-word;
      color: #14532d;
      font-family: 'Georgia', serif;
    }

    .completion {
      color: #2a3d31;
      font-weight: 600;
      font-size: 18px;
      line-height: 1.45;
      max-width: 820px;
      margin: 0 auto;
      font-family: 'Georgia', serif;
      display: grid;
      gap: 2px;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1fr;
      align-items: center;
      justify-items: center;
      gap: 10px;
      max-width: 720px;
      margin: 0 auto;
      padding-top: 6px;
      color: #a16207;
    }

    .stat {
      display: grid;
      justify-items: center;
      gap: 6px;
      min-width: 140px;
    }

    .stat-icon {
      width: 28px;
      height: 28px;
      color: #a16207;
    }

    .stat-text {
      font-weight: 700;
      font-size: 14px;
      color: #a16207;
      white-space: nowrap;
      font-family: 'Georgia', serif;
    }

    .stat-divider {
      width: 1px;
      height: 42px;
      background: rgba(161, 98, 7, 0.3);
    }

    .stats-more {
      /* Match the main stats row spacing so the two rows feel consistent */
      margin-top: 0;
      grid-template-columns: 1fr auto 1fr;
      max-width: 520px;
      padding-top: 6px;
    }

    .bottom {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: flex-end;
      gap: 16px;
      padding-bottom: 6px;
    }

    .certificate.exporting .bottom {
      padding-bottom: 2px !important;
    }

    .signer {
      text-align: center;
      justify-self: center;
      min-width: 260px;
    }

    .sign-img {
      height: 42px;
      width: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto 6px;
      filter: contrast(1.2);
    }

    .sign-name {
      color: #14532d;
      font-weight: 800;
      font-size: 15px;
      font-family: 'Georgia', serif;
    }

    .sign-title {
      color: #2a3d31;
      font-weight: 600;
      font-size: 12px;
      margin-top: 2px;
    }

    .issued {
      text-align: right;
      min-width: 160px;
      justify-self: end;
    }

    .issued-value {
      color: #14532d;
      font-weight: 800;
      font-size: 14px;
    }

    .issued-label {
      color: #2a3d31;
      font-weight: 600;
      font-size: 12px;
      margin-top: 4px;
    }

    /*
      Saving is an explicit tap. It has to be: iOS only opens the share sheet while the tap's
      user activation is alive, so an automatic download after a route change can never work
      there — which is exactly how certificates used to vanish silently on iPhones.
    */
    .cert-actions {
      width: 100%;
      max-width: 1122px;
      margin: 0 auto;
      text-align: center;
    }

    .save-hint {
      margin: 0 0 4px;
      font-size: 14px;
      color: #3d5145;
    }

    .save-error {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
      color: #b91c1c;
    }

    .action-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      margin: 8px -6px 0;
    }

    .act {
      -webkit-appearance: none;
      appearance: none;
      margin: 6px;
      padding: 13px 24px;
      min-height: 46px;          /* comfortable tap target on small phones */
      border-radius: 10px;
      border: 2px solid transparent;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }

    .act[disabled] {
      opacity: 0.55;
      cursor: default;
    }

    .act-primary {
      background: #15803d;
      color: #fff;
    }

    .act-secondary {
      background: #fff;
      color: #15803d;
      border-color: #bbf7d0;
    }

    .act-finish {
      background: #edf1e4;
      color: #2a3d31;
      border-color: #c6d3bf;
    }

    /*
      Shown only when neither the share sheet nor a download could save the file, which is
      every iPhone before iOS 15 that is also before iOS 13 for downloads. Pressing and
      holding an image is the one save gesture that has always worked in Safari.
    */
    .save-fallback {
      margin-top: 20px;
      padding: 16px;
      border: 2px dashed #bbf7d0;
      border-radius: 12px;
      background: #f0fdf4;
    }

    .save-fallback-hint {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
      color: #166534;
    }

    .save-fallback-image {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #c6d3bf;
    }

    .pdf-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(10, 31, 20, .52);
    }

    .pdf-dialog {
      width: min(100%, 440px);
      padding: 24px;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(10, 31, 20, .28);
      text-align: left;
    }

    .pdf-dialog h2 {
      margin: 0 0 10px;
      color: #14532d;
      font-size: 21px;
    }

    .pdf-dialog p {
      margin: 0;
      color: #2a3d31;
      line-height: 1.5;
    }

    .pdf-dialog-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }

    .pdf-dialog-actions .act {
      margin: 0;
      text-decoration: none;
      text-align: center;
    }

    .pdf-open-button {
      flex: 1 1 180px;
      background: #166534;
      border-color: #166534;
      box-shadow: 0 4px 10px rgba(22, 101, 52, .2);
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    }

    .pdf-open-button:hover {
      background: #14532d;
      box-shadow: 0 7px 14px rgba(22, 101, 52, .26);
      transform: translateY(-1px);
    }

    @media (max-width: 768px) {
      .cert-page { padding: 12px; gap: 16px; }
      .act { flex: 1 1 45%; padding: 13px 12px; font-size: 14px; }
      .toolbar { flex-direction: column; align-items: stretch; gap: 12px; }
      .name-input-group { flex-direction: row; align-items: center; gap: 8px; }
      .name-label { font-size: 13px; }
      .name {
        flex: 1;
        max-width: none;
        padding: 10px 12px;
        font-size: 14px;
      }
      .btn {
        flex: 1;
        padding: 10px 16px;
        font-size: 13px;
      }
      .time {
        font-size: 14px;
        padding: 6px 12px;
      }
    }

    @media (max-width: 480px) {
      .toolbar { padding: 12px; }
      .name-input-group { gap: 6px; }
      .name-label { font-size: 12px; }
      .name {
        padding: 8px 10px;
        font-size: 13px;
      }
      .btn {
        padding: 8px 12px;
        font-size: 12px;
      }
    }

    @media print {
      * { margin: 0; padding: 0; }
      body, html { margin: 0; padding: 0; }
      app-root, [role="banner"], header, nav, .navbar, .toolbar { display: none !important; }
      .cert-page {
        background: white !important;
        padding: 0 !important;
        margin: 0 !important;
        min-height: auto !important;
        gap: 0 !important;
      }
      .certificate {
        width: 11.69in !important;
        height: 8.27in !important;
        max-width: none !important;
        margin: 0 !important;
        box-shadow: none !important;
        page-break-after: avoid !important;
        padding: 0 !important;
      }

      .cert-bg { border-radius: 0 !important; }
      .cert-content { padding: 0.55in 0.7in !important; position: relative !important; }
      .top-logo { height: 64px !important; }
      .cert-title { font-size: 40px !important; }
      .certify { font-size: 18px !important; }
      .recipient-name { font-size: 46px !important; }
      .completion { font-size: 18px !important; }
      .stat-icon { width: 28px !important; height: 28px !important; }
      .stat-text { font-size: 14px !important; }
      .sign-img { height: 42px !important; }
      .sign-name { font-size: 15px !important; }
      .sign-title { font-size: 12px !important; }
    }
  `]
})
export class CertificateComponent implements OnInit, AfterViewInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private storage = inject(StorageService);
  private languageService = inject(LanguageService);
  private locationTracking = inject(LocationTrackingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);

  @ViewChild('certStage') private certStageRef?: ElementRef<HTMLElement>;
  private stageResizeObserver?: ResizeObserver;
  private stageResizeFallback?: () => void;

  private html2canvasReady: Promise<Html2CanvasFn> | null = null;
  private jspdfReady: Promise<JsPdfCtor> | null = null;

  // The certificate image is rendered before the user taps Save. iOS only honours
  // navigator.share() while the tap's user activation is still alive, and rendering the
  // canvas takes much longer than that window — so the render happens up front and the
  // tap handler only hands the finished file to the share sheet.
  private preparedCertificate: PreparedCertificate | null = null;
  private preparingCertificate: Promise<PreparedCertificate | null> | null = null;

  saveState: 'idle' | 'working' | 'done' | 'error' = 'idle';
  canShareFiles = false;
  /* Set when the only way left to save is for the user to press and hold the image. */
  savedImageUrl: string | null = null;
  pdfFallbackUrl: string | null = null;
  private pdfFallbackObjectUrl: string | null = null;
  private shouldResetOnFinish = false;

  currentLang = computed(() => this.languageService.currentLanguage().code);

  // Expose translations as a signal so the template updates when language changes
  readonly t = this.languageService.t;

  userName = '';
  startedAt?: Date;
  completedAt?: Date;
  durationText = '';
  completedDate = '';

  totalSteps = 0;
  totalCalories = 0;
  totalOxygen = 0;
  totalPythaside = 0;
  starsEarned = 0;

  // ── Activity model: derive the wellness stats from the REAL distance walked ──────────
  // Single source of truth is the deadband-filtered GPS distance for this run; steps,
  // calories, oxygen and phytoncide are all computed from it so they stay consistent.
  private readonly STEP_LENGTH_M = 0.75;            // typical adult stride
  private readonly ASSUMED_BODY_WEIGHT_KG = 60;     // no weight input, so assume an average adult
  private readonly WALK_KCAL_PER_KG_PER_KM = 0.85;  // gross walking energy (~51 kcal/km at 60 kg)
  private readonly OXYGEN_LITERS_PER_KCAL = 0.2;    // ~5 kcal released per litre of O2 consumed
  private readonly PHYTONCIDE_PER_KM = 200;         // gamified forest-exposure score per km walked

  completedCheckpoints = 0;
  totalCheckpoints = 0;
  isPreviewMode = false;
  /** Finish only shows after the post-trail questionnaire is done or skipped via Continue. */
  readyToFinish = signal(false);

  ngOnInit() {
    // Skip initialization during SSR
    if (!isPlatformBrowser(this.platformId)) return;

    this.readyToFinish.set(this.storage.getReadyToFinish());

    // Load name - first try to get from registered user, then fall back to saved certificate name
    let registeredName = this.storage.getUsername();
    let savedCertName = this.storage.getCertificateName();

    // Use certificate name if set (user override), otherwise use registered username
    this.userName = savedCertName || registeredName || '';

    // Load timing
    const start = this.storage.getStartTime();
    const end = this.storage.getCompletedAt();
    if (start) this.startedAt = new Date(start);
    if (end) this.completedAt = new Date(end);
    if (!this.completedAt) { this.completedAt = new Date(); }

    this.completedDate = this.completedAt ? this.completedAt.toLocaleDateString() : '';
    this.durationText = this.computeDuration();

    // Load saved stats first, then refresh from mission data if available
    this.loadPersistedCertificateStats();
    this.loadMissionStats();

    // Load earned stars
    this.loadEarnedStars();
    this.saveCertificateStats();

    this.isPreviewMode = this.route.snapshot.queryParamMap.get('preview') === '1';
    if (this.isPreviewMode) return;

    this.canShareFiles = this.supportsFileShare();

    // Render the certificate now, while the user is reading the page. Saving then only
    // has to hand over a finished file, which is what keeps iOS's share sheet reachable.
    void this.prepareCertificate();
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.startStageScaling();
  }

  ngOnDestroy(): void {
    if (this.stageResizeObserver) this.stageResizeObserver.disconnect();
    if (this.stageResizeFallback) {
      window.removeEventListener('resize', this.stageResizeFallback);
      window.removeEventListener('orientationchange', this.stageResizeFallback);
    }
    this.closePdfFallback();
  }

  /**
   * Keep the fixed-size certificate scaled to whatever width its stage has, so the whole
   * thing is visible on any screen and matches the saved file exactly. ResizeObserver is the
   * accurate signal but only exists from iOS 13.4, so older iPhones fall back to window events.
   */
  private startStageScaling(): void {
    const stage = this.certStageRef ? this.certStageRef.nativeElement : null;
    if (!stage) return;

    const applyScale = () => {
      const width = stage.clientWidth;
      if (width > 0) {
        // Written straight to the element so it wins over the CSS baseline in the styles.
        stage.style.setProperty('--cert-scale', String(width / CERT_EXPORT_WIDTH_PX));
      }
    };

    // Measure now and again after the first paint: on a hydrated page the stage can still be
    // zero-width when this hook runs, and a zero measurement must not be the final answer.
    applyScale();
    requestAnimationFrame(applyScale);
    setTimeout(applyScale, 250);

    if (typeof ResizeObserver !== 'undefined') {
      // Outside Angular: this fires on every frame of a resize and only writes a CSS
      // variable, so there is nothing for change detection to do.
      this.zone.runOutsideAngular(() => {
        this.stageResizeObserver = new ResizeObserver(applyScale);
        this.stageResizeObserver.observe(stage);
      });
      return;
    }

    // ResizeObserver only exists from iOS 13.4, so older iPhones follow window events.
    this.stageResizeFallback = applyScale;
    window.addEventListener('resize', applyScale);
    window.addEventListener('orientationchange', applyScale);
  }

  private hasAtLeastCopperCertificate(): boolean {
    // Align with Home logic: at least one completed checkpoint.
    return this.completedCheckpoints > 0;
  }

  /** Whether this browser can hand a file to the OS share sheet (the only reliable iOS route). */
  private supportsFileShare(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data?: ShareData) => boolean;
    };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      const probe = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
      return nav.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  private loadMissionStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const missions = this.storage.getMissions();
      if (!missions || missions.length === 0) return;

      // Reset totals (defensive if re-initialized)
      this.totalCheckpoints = 0;
      this.completedCheckpoints = 0;
      this.totalSteps = 0;
      this.totalCalories = 0;
      this.totalOxygen = 0;
      this.totalPythaside = 0;

      this.totalCheckpoints = Array.isArray(missions) ? missions.length : 0;

      // Single source of truth: the REAL distance walked this run (deadband-filtered GPS).
      const trackedMeters = this.computeTrackedMeters();

      // Count completed checkpoints + gather a fallback step estimate (used only when there
      // is no usable GPS distance, e.g. indoor testing or older data).
      let fallbackStepsFromMissions = 0;
      missions.forEach((mission: any) => {
        if (mission.reached) {
          this.completedCheckpoints += 1;
          const missionSteps = Array.isArray(mission?.steps) ? mission.steps.length : 0;
          fallbackStepsFromMissions += missionSteps;
        }
      });

      if (typeof trackedMeters === 'number' && trackedMeters > 0) {
        // Distance-based: steps, calories, oxygen and phytoncide all scale with real metres.
        const km = trackedMeters / 1000;
        this.totalSteps = Math.round(trackedMeters / this.STEP_LENGTH_M);
        this.totalCalories = this.WALK_KCAL_PER_KG_PER_KM * this.ASSUMED_BODY_WEIGHT_KG * km;
        this.totalOxygen = this.totalCalories * this.OXYGEN_LITERS_PER_KCAL;
        this.totalPythaside = km * this.PHYTONCIDE_PER_KM;
      } else {
        // Fallback (no GPS track): keep the old per-checkpoint estimates so nothing shows 0.
        this.totalSteps = fallbackStepsFromMissions > 0 ? fallbackStepsFromMissions : this.completedCheckpoints;
        this.totalCalories = this.completedCheckpoints * 50;
        this.totalOxygen = this.completedCheckpoints * 0.5;
        this.totalPythaside = this.completedCheckpoints * 100;
      }

      // Round values for display
      this.totalCalories = Math.round(this.totalCalories);
      this.totalOxygen = Math.round(this.totalOxygen * 10) / 10;
      this.totalPythaside = Math.round(this.totalPythaside);
      this.saveCertificateStats();
    } catch (error) {
      console.error('Error loading mission stats:', error);
    }
  }

  // Real distance walked during this run, in metres (deadband-filtered). Null when there is
  // no usable GPS track, so callers can fall back to checkpoint-based estimates.
  private computeTrackedMeters(): number | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    // Only count the points for the current run to avoid mixing historic tracking sessions.
    const startMs = this.startedAt?.getTime();
    const endMs = this.completedAt?.getTime();
    const hasWindow = typeof startMs === 'number' && typeof endMs === 'number' && endMs >= startMs;

    const allPoints = this.locationTracking.points();
    if (!Array.isArray(allPoints) || allPoints.length < 2) return null;

    const points = hasWindow
      ? allPoints.filter(p => typeof p?.timestamp === 'number' && p.timestamp >= (startMs as number) && p.timestamp <= (endMs as number))
      : allPoints;

    if (points.length < 2) return null;

    const meters = this.computePathDistanceMeters(points);
    if (!isFinite(meters) || meters <= 0) return null;
    return meters;
  }

  // While standing still GPS noise bounces the fix around the true position — often further
  // than the reported accuracy — and each bounce summed as walking inflates the step/calorie
  // totals over a long pause. Hold an anchor and only add distance when a fix passes ALL of:
  //   1. moved past a deadband scaled to the reported accuracy (noisy fixes need a clearer
  //      move to count, e.g. under tree canopy),
  //   2. the implied speed from the anchor is humanly plausible for this walking route
  //      (stationary noise "jumps" 10 m in one 2 s fix interval — no walker does that),
  //   3. the device's doppler speed (when available) does not say the user is standing still,
  //   4. the NEXT fix is also past the deadband (real walking keeps going; noise bounces back).
  // Distance is then added anchor→fix, so on a continuous walk the total is unchanged — the
  // path is just sampled more coarsely.
  // NOTE: this only affects the distance/step computation; checkpoint detection still uses
  // the raw fixes, so in-field gameplay is unchanged.
  private readonly MIN_MOVE_DEADBAND_M = 8;
  private readonly ACCURACY_DEADBAND_FACTOR = 1.5;
  private readonly MAX_PLAUSIBLE_SPEED_MPS = 3;       // brisk jog; this is a walking trail
  private readonly STATIONARY_DOPPLER_MPS = 0.3;      // reported speed below this = standing

  private computePathDistanceMeters(points: TrackedPoint[]): number {
    let total = 0;
    let anchor: TrackedPoint | null = null;
    let pendingConfirmation = false;
    for (let i = 0; i < points.length; i++) {
      const b = points[i];

      if (!this.isFiniteNumber(b?.lat) || !this.isFiniteNumber(b?.lng)) continue;
      // Optional sanity filter: skip extremely inaccurate points.
      if (this.isFiniteNumber(b?.accuracy) && b.accuracy! > 80) continue;

      if (!anchor) {
        anchor = b;
        continue;
      }

      const d = this.haversineMeters(anchor.lat, anchor.lng, b.lat, b.lng);
      // Ignore wild GPS jumps.
      if (d > 250) {
        anchor = b;
        pendingConfirmation = false;
        continue;
      }

      // Gate 1: sub-deadband wobble — keep the anchor, don't count it as walking.
      const accAnchor = this.isFiniteNumber(anchor.accuracy) ? anchor.accuracy! : 0;
      const accPoint = this.isFiniteNumber(b.accuracy) ? b.accuracy! : 0;
      const deadband = Math.max(
        this.MIN_MOVE_DEADBAND_M,
        Math.max(accAnchor, accPoint) * this.ACCURACY_DEADBAND_FACTOR
      );
      if (d < deadband) {
        pendingConfirmation = false;
        continue;
      }

      // Gate 2: a jump faster than a human walks/jogs is a noise spike, not steps.
      const dtSeconds = (b.timestamp - anchor.timestamp) / 1000;
      const impliedSpeed = dtSeconds > 0 ? d / dtSeconds : Infinity;
      if (impliedSpeed > this.MAX_PLAUSIBLE_SPEED_MPS) {
        pendingConfirmation = false;
        continue;
      }

      // Gate 3: if the device's doppler speed says both endpoints were standing still,
      // the coordinate jump is noise. Only applies when both fixes report a speed.
      if (
        this.isFiniteNumber(anchor.speed) && anchor.speed! < this.STATIONARY_DOPPLER_MPS &&
        this.isFiniteNumber(b.speed) && b.speed! < this.STATIONARY_DOPPLER_MPS
      ) {
        pendingConfirmation = false;
        continue;
      }

      // Gate 4: require a second consecutive fix past the deadband before committing.
      // Stationary noise bounces back inside the deadband; real movement keeps going.
      if (!pendingConfirmation) {
        pendingConfirmation = true;
        continue;
      }

      total += d;
      anchor = b;
      pendingConfirmation = false;
    }
    return total;
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371_000; // meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private isFiniteNumber(value: any): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private loadEarnedStars(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const data = this.storage.getBotanyStars();
      if (data) {
        this.starsEarned = data.starsEarned || 0;
        this.saveCertificateStats();
      }
    } catch (error) {
      console.error('Error loading earned stars:', error);
    }
  }

  private loadPersistedCertificateStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const saved = this.storage.getCertificateStats();
      if (!saved) return;

      this.totalCheckpoints = this.toNumber(saved.totalCheckpoints);
      this.completedCheckpoints = this.toNumber(saved.completedCheckpoints);
      this.totalSteps = this.toNumber(saved.totalSteps);
      this.totalCalories = this.toNumber(saved.totalCalories);
      this.totalOxygen = this.toNumber(saved.totalOxygen);
      this.totalPythaside = this.toNumber(saved.totalPythaside);
      this.starsEarned = this.toNumber(saved.starsEarned);
    } catch (error) {
      console.error('Error loading saved certificate stats:', error);
    }
  }

  private saveCertificateStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const stats: CertificateStatsStorage = {
      totalCheckpoints: this.toNumber(this.totalCheckpoints),
      completedCheckpoints: this.toNumber(this.completedCheckpoints),
      totalSteps: this.toNumber(this.totalSteps),
      totalCalories: this.toNumber(this.totalCalories),
      totalOxygen: this.toNumber(this.totalOxygen),
      totalPythaside: this.toNumber(this.totalPythaside),
      starsEarned: this.toNumber(this.starsEarned)
    };

    this.storage.setCertificateStats(stats);
  }

  private toNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private computeDuration(): string {
    if (!this.startedAt || !this.completedAt) return '—';
    const ms = this.completedAt.getTime() - this.startedAt.getTime();
    const secs = Math.floor(ms / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const parts = [] as string[];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  durationMinutes(): number {
    if (!this.startedAt || !this.completedAt) return 0;
    const ms = this.completedAt.getTime() - this.startedAt.getTime();
    return Math.max(0, Math.round(ms / 60000));
  }

  saveName() {
    this.storage.setCertificateName(this.userName);
  }

  /**
   * Save the certificate image. Call this straight from a click handler: iOS only opens
   * the share sheet while the tap's user activation is alive, so the render is done ahead
   * of time (see prepareCertificate) and this awaits as little as possible.
   */
  async saveCertificate(): Promise<CertificateDeliveryResult> {
    if (!isPlatformBrowser(this.platformId)) return 'failed';

    this.saveState = 'working';
    const prepared = await this.prepareCertificate();
    if (!prepared) {
      this.saveState = 'error';
      return 'failed';
    }

    // Save is a download action. Keep the share sheet for the separate Share button.
    const result = this.downloadBlob(prepared.pngBlob, prepared.fileBaseName + '.png');
    if (result === 'failed') this.savedImageUrl = prepared.pngDataUrl;
    this.saveState = result === 'delivered' ? 'done' : 'error';
    return result === 'delivered' || this.savedImageUrl ? 'delivered' : 'failed';
  }

  async downloadPng(): Promise<boolean> {
    return (await this.saveCertificate()) === 'delivered';
  }

  async downloadPdf(): Promise<CertificateDeliveryResult> {
    if (!isPlatformBrowser(this.platformId)) return 'failed';

    this.saveState = 'working';

    const jsPDFCtor = await this.loadJsPdf();
    const prepared = jsPDFCtor ? await this.prepareCertificate() : null;
    if (!jsPDFCtor || !prepared) {
      this.saveState = 'error';
      return 'failed';
    }

    const imgData = prepared.pngDataUrl;

    // A4 landscape in mm: 297 x 210
    const pdf = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const pageWidth = 297;
    const pageHeight = 210;
    const imgWidthPx = prepared.width;
    const imgHeightPx = prepared.height;

    // Fit image into page while preserving aspect ratio.
    const imgAspect = imgWidthPx / imgHeightPx;
    const pageAspect = pageWidth / pageHeight;

    let renderWidth = pageWidth;
    let renderHeight = pageHeight;
    if (imgAspect > pageAspect) {
      // image is wider than page
      renderWidth = pageWidth;
      renderHeight = pageWidth / imgAspect;
    } else {
      // image is taller than page
      renderHeight = pageHeight;
      renderWidth = pageHeight * imgAspect;
    }

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');

    const pdfBlob: Blob = pdf.output('blob');

    const filename = prepared.fileBaseName + '.pdf';
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
    const isIos = this.iosMajorVersion() !== null;
    let result: CertificateDeliveryResult = 'failed';

    if (isIos && this.canShareFiles) {
      try {
        const nav = navigator as Navigator & { share: (data: ShareData) => Promise<void> };
        await nav.share({
          title: 'Forest Bathing Certificate',
          files: [pdfFile]
        });
        result = 'delivered';
      } catch (error: any) {
        if (error?.name === 'AbortError') result = 'failed';
      }
    }

    if (result === 'failed' && !isIos && this.supportsAnchorDownload()) {
      result = this.downloadBlob(pdfBlob, filename);
    }

    if (result === 'failed') {
      this.showPdfFallback(pdfBlob);
      result = 'delivered';
    }
    this.saveState = result === 'delivered' ? 'done' : 'error';
    return result;
  }

  closePdfFallback(): void {
    if (this.pdfFallbackObjectUrl) URL.revokeObjectURL(this.pdfFallbackObjectUrl);
    this.pdfFallbackObjectUrl = null;
    this.pdfFallbackUrl = null;
  }

  private showPdfFallback(blob: Blob): void {
    this.closePdfFallback();
    this.pdfFallbackObjectUrl = URL.createObjectURL(blob);
    this.pdfFallbackUrl = this.pdfFallbackObjectUrl;
  }

  async shareCertificateWithCoordinates(): Promise<CertificateDeliveryResult> {
    if (!isPlatformBrowser(this.platformId)) return 'failed';

    this.saveState = 'working';
    const prepared = await this.prepareCertificate();
    if (!prepared) {
      this.saveState = 'error';
      return 'failed';
    }

    const point = this.getLastTrackedPointForSession();
    const coordinatesText = point
      ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}\nhttps://maps.google.com/?q=${point.lat},${point.lng}`
      : 'Unavailable';

    const result = await this.deliverFile(prepared.pngBlob, prepared.fileBaseName + '.png', prepared.pngDataUrl, {
      title: 'Forest Bathing Certificate',
      text: `${this.userName || 'Participant'}\nCoordinates: ${coordinatesText}`
    });

    this.saveState = result === 'delivered' ? 'done' : 'error';
    return result;
  }

  /** Open the post-trail stress check so it can be compared with the pre-trail one. */
  goToStressQuestionnaire(): void {
    void this.router.navigate(['/stress-questionnaire'], { queryParams: { phase: 'after' } });
  }

  /**
   * Finish the run. Deliberately separate from saving: progress used to be reset as a side
   * effect of a "successful" download, so a failed render silently kept the old run alive —
   * a start time that never cleared is how a certificate ended up reporting 209,141 minutes.
   */
  finishRun(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!confirm(this.t().certificatePage.finishConfirm)) return;
    // Full reset: wipe everything including the auth token, then return to login.
    this.storage.clear();
    this.locationTracking.clearSavedPoints();

    window.location.href = '/login';
  }

  /**
   * Render the certificate once and keep it. Repeated saves reuse the same image, and the
   * slow part is done before the user taps so the share sheet stays reachable on iOS.
   */
  private prepareCertificate(): Promise<PreparedCertificate | null> {
    if (this.preparedCertificate) return Promise.resolve(this.preparedCertificate);
    if (this.preparingCertificate) return this.preparingCertificate;

    const work = (async (): Promise<PreparedCertificate | null> => {
      const canvas = await this.renderCertificateCanvas();
      if (!canvas) return null;

      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (!pngBlob) return null;

      const prepared: PreparedCertificate = {
        pngBlob,
        pngDataUrl: canvas.toDataURL('image/png'),
        fileBaseName: `Certificate-${this.sanitizeFileName(this.userName || 'Forest-Bathing-Trail')}`,
        width: canvas.width,
        height: canvas.height
      };
      this.preparedCertificate = prepared;
      return prepared;
    })();

    this.preparingCertificate = work;
    const clear = () => { if (this.preparingCertificate === work) this.preparingCertificate = null; };
    void work.then(clear, clear);

    return work;
  }

  /**
   * Hand a file to the user. The share sheet is tried first because on iOS it is the only
   * route that reliably lands a file in Photos/Files: Safari blocks top-level navigation to
   * data: URIs and ignores the download attribute, and neither works at all once the site has
   * been installed to the home screen. Everywhere else a blob URL download is the familiar path.
   */
  private async deliverFile(
    blob: Blob,
    filename: string,
    dataUrl: string,
    extra?: { title?: string; text?: string }
  ): Promise<CertificateDeliveryResult> {
    if (this.canShareFiles) {
      try {
        const nav = navigator as Navigator & { share: (data: ShareData) => Promise<void> };
        await nav.share({ ...extra, files: [new File([blob], filename, { type: blob.type })] });
        return 'delivered';
      } catch (error: any) {
        // A dismissed share sheet is the user's choice, not a delivery — and definitely not
        // grounds to reset their progress.
        if (error?.name === 'AbortError') return 'failed';
        // Anything else means share could not take this payload; fall through to a download.
      }
    }

    if (this.supportsAnchorDownload()) {
      const downloaded = this.downloadBlob(blob, filename);
      if (downloaded === 'delivered') return 'delivered';
    }

    /*
      Last resort, and the only route on iOS 12-14: no share-with-files, and Safari ignores the
      download attribute before iOS 13. Showing the finished image in the page lets the user
      press and hold it to save — the same gesture they already use to save any photo.
    */
    this.savedImageUrl = dataUrl;
    return 'delivered';
  }

  /**
   * Whether an <a download> click actually saves a file.
   *
   * Feature detection cannot answer this: iOS Safari has had the 'download' property on the
   * anchor prototype since 10.1 while ignoring it until 13, so 'download' in HTMLAnchorElement
   * reports a capability the browser does not have. The iOS version in the user agent is the
   * only reliable signal, and it is accurate because every iOS browser is Safari underneath.
   */
  private supportsAnchorDownload(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    if (!('download' in HTMLAnchorElement.prototype)) return false;

    const major = this.iosMajorVersion();
    return major === null || major >= 13;
  }

  /** Major iOS version, or null when this is not iOS. */
  private iosMajorVersion(): number | null {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua)
      || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
    if (!isIos) return null;

    const match = /OS (\d+)[._]/.exec(ua);
    return match ? parseInt(match[1], 10) : null;
  }

  private downloadBlob(blob: Blob, filename: string): CertificateDeliveryResult {
    try {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Keep the URL alive long enough for the browser to finish reading it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'delivered';
    } catch {
      return 'failed';
    }
  }

  printCert() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.print();
  }

  /*
    html2canvas and jsPDF are real dependencies pulled in with a dynamic import rather than
    CDN script tags. That is what makes the certificate work with no signal — the common case
    on the trail, and previously the reason downloads failed silently. The dynamic import also
    keeps both libraries out of the initial bundle and out of the SSR build, since these
    helpers only ever run in the browser.
  */
  private async loadHtml2Canvas(): Promise<Html2CanvasFn | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.html2canvasReady) {
      this.html2canvasReady = import('html2canvas').then(m => (m.default ?? m) as unknown as Html2CanvasFn);
    }
    try {
      return await this.html2canvasReady;
    } catch {
      this.html2canvasReady = null;   // let a later attempt retry
      return null;
    }
  }

  private async loadJsPdf(): Promise<JsPdfCtor | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.jspdfReady) {
      this.jspdfReady = import('jspdf').then(m => m.jsPDF as unknown as JsPdfCtor);
    }
    try {
      return await this.jspdfReady;
    } catch {
      this.jspdfReady = null;
      return null;
    }
  }

  private sanitizeFileName(value: string): string {
    const cleaned = (value || '').trim();
    const safe = cleaned
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return safe || 'certificate';
  }

  private getLastTrackedPointForSession(): TrackedPoint | null {
    const allPoints = this.locationTracking.points();
    if (!Array.isArray(allPoints) || allPoints.length === 0) return null;

    const startMs = this.startedAt?.getTime();
    const endMs = this.completedAt?.getTime();
    const hasWindow = typeof startMs === 'number' && typeof endMs === 'number' && endMs >= startMs;

    if (!hasWindow) {
      return allPoints[allPoints.length - 1] || null;
    }

    const pointsInSession = allPoints.filter(
      (point) => typeof point?.timestamp === 'number' && point.timestamp >= (startMs as number) && point.timestamp <= (endMs as number)
    );

    return pointsInSession[pointsInSession.length - 1] || allPoints[allPoints.length - 1] || null;
  }

  /**
   * Capture the certificate at full A4 size.
   *
   * A detached clone is captured rather than the element on screen. The export layout is the
   * unscaled 1122x794 one, so switching the live element into it made the certificate visibly
   * jump and get cropped by its stage — very noticeable now that a capture is prepared as soon
   * as the page opens. The clone is parked off-screen instead, and the visible certificate
   * never changes at all.
   */
  private async renderCertificateCanvas(): Promise<HTMLCanvasElement | null> {
    const html2canvas = await this.loadHtml2Canvas();
    if (!html2canvas) return null;

    const el = document.getElementById('certificate') as HTMLElement | null;
    if (!el) return null;

    const host = document.createElement('div');
    host.setAttribute(
      'style',
      'position:fixed;left:-20000px;top:0;width:1122px;height:794px;overflow:hidden;' +
      'z-index:-1;pointer-events:none;'
    );

    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');           // never two #certificate ids in one document
    clone.classList.add('exporting');
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      await this.waitForRenderAssets(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        allowTaint: false,
        useCORS: true,
        removeContainer: true
      });

      return canvas as HTMLCanvasElement;
    } finally {
      host.remove();
    }
  }

  private async waitForRenderAssets(root: HTMLElement): Promise<void> {
    // Ensure web fonts are ready (important for Thai text and consistent sizing)
    try {
      // @ts-ignore
      const fontsReady = (document as any).fonts?.ready as Promise<void> | undefined;
      if (fontsReady) await fontsReady;
    } catch {
      // ignore
    }

    // Ensure images inside the certificate are loaded before capture
    const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      })
    );

    // Allow a frame for layout/paint after toggling export mode
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
