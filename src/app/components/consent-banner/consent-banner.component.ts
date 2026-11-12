import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ConsentService } from '../../services/consent.service';
import { LanguageService } from '../../services/language.service';
import { StorageService } from '../../services/storage.service';

/**
 * Asks before anything is written to the visitor's device (PDPA).
 *
 * Deliberately offers a real choice rather than a single "accept" button: declining is
 * honoured — StorageService switches to an in-memory store, so the trail still works for the
 * session but nothing is left behind afterwards.
 */
@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="consent-wrap" role="dialog" aria-modal="false" [attr.aria-label]="t().title">
        <div class="consent-card">
          <h2 class="consent-title">{{ t().title }}</h2>
          <p class="consent-text">{{ t().body }}</p>

          @if (expanded()) {
            <ul class="consent-list">
              @for (item of t().items; track item) {
                <li>{{ item }}</li>
              }
            </ul>
          }

          <button type="button" class="consent-toggle" (click)="expanded.set(!expanded())">
            {{ expanded() ? t().less : t().more }}
          </button>

          <div class="consent-actions">
            <button type="button" class="btn btn-accept" (click)="accept()">{{ t().accept }}</button>
            <button type="button" class="btn btn-decline" (click)="decline()">{{ t().decline }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .consent-wrap {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      z-index: 1200;
      box-sizing: border-box;
      /* Clear of the bottom nav, and of the home indicator on notched iPhones. */
      padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
      display: flex;
      justify-content: center;
      pointer-events: none;
    }

    .consent-card {
      pointer-events: auto;
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      padding: 18px;
      border-radius: 16px;
      background: #fff;
      border: 1px solid #dbe3d0;
      box-shadow: 0 -4px 28px rgba(10, 31, 20, .18);
    }

    .consent-title {
      margin: 0 0 8px;
      font-size: 17px;
      font-weight: 800;
      color: #0a1f14;
    }

    .consent-text {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: #3d5145;
    }

    .consent-list {
      margin: 10px 0 0;
      padding-inline-start: 20px;
      font-size: 13px;
      line-height: 1.65;
      color: #3d5145;
    }

    .consent-toggle {
      -webkit-appearance: none;
      appearance: none;
      margin-top: 8px;
      padding: 4px 0;
      border: none;
      background: none;
      color: #15803d;
      font-size: 13px;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }

    .consent-actions {
      display: flex;
      flex-wrap: wrap;
      margin: 14px -5px 0;
    }

    .btn {
      -webkit-appearance: none;
      appearance: none;
      flex: 1 1 140px;
      margin: 5px;
      padding: 12px 18px;
      min-height: 46px;          /* comfortable tap target */
      border-radius: 10px;
      border: 2px solid transparent;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-accept { background: #15803d; color: #fff; }
    .btn-decline { background: #fff; color: #2a3d31; border-color: #c6d3bf; }

    @media (min-width: 560px) {
      .consent-wrap { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
    }
  `],
})
export class ConsentBannerComponent {
  private readonly consent = inject(ConsentService);
  private readonly storage = inject(StorageService);
  private readonly languageService = inject(LanguageService);

  readonly expanded = signal(false);
  readonly visible = computed(() => this.consent.needsStorageDecision());

  private readonly lang = computed(() => this.languageService.currentLanguage().code);

  readonly t = computed(() =>
    this.lang() === 'th'
      ? {
          title: 'ขออนุญาตเก็บข้อมูลบนเครื่องของคุณ',
          body:
            'แอปนี้เก็บข้อมูลไว้ในเครื่องของคุณเองเพื่อให้เดินเส้นทางต่อได้ ' +
            'ไม่มีการส่งออกไปให้บุคคลภายนอก',
          items: [
            'ความคืบหน้าของภารกิจและจุดที่ผ่านแล้ว',
            'เส้นทางที่เดิน (พิกัด GPS) เพื่อคำนวณระยะทางบนเกียรติบัตร',
            'ภาษาที่เลือกและสถานที่ที่กำลังเดิน',
          ],
          more: 'ดูรายละเอียด',
          less: 'ซ่อนรายละเอียด',
          accept: 'ยินยอม',
          decline: 'ไม่ยินยอม',
        }
      : {
          title: 'Permission to store data on your device',
          body:
            'This app keeps your progress on your own device so you can continue the trail. ' +
            'Nothing is shared with third parties.',
          items: [
            'Mission progress and the checkpoints you have reached',
            'The route you walked (GPS points), used for the distance on your certificate',
            'Your chosen language and the location you are walking',
          ],
          more: 'See details',
          less: 'Hide details',
          accept: 'Accept',
          decline: 'Decline',
        }
  );

  accept(): void {
    this.consent.setStorageConsent('granted');
    // Anything buffered while the banner was open now belongs on the device.
    this.storage.flushPendingWrites();
  }

  decline(): void {
    this.consent.setStorageConsent('denied');
    /*
      Saying no has to mean something: anything already on the device from a previous visit is
      removed, and from here on StorageService keeps the walk in memory only. The trail still
      works for this session, it just leaves nothing behind.
    */
    this.storage.forgetStoredData();
  }
}
