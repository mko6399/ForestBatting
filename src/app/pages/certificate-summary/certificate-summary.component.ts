import { Component, OnInit, inject, PLATFORM_ID, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { StorageService } from '../../services/storage.service';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-certificate-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="summary-page">
      <div class="summary-container">
        <!-- Certificate Preview -->
        <div class="certificate-preview">
          <div class="preview-label">{{ t().certificateSummary.certificatePreview }}</div>
          @if (certificatePreviewUrl) {
            <div class="preview-viewport">
              <iframe
                class="preview-frame"
                [src]="certificatePreviewUrl"
                title="Certificate Preview">
              </iframe>
            </div>
          } @else {
            <div class="preview-placeholder">
              <p>{{ t().certificateSummary.certificatePreviewMessage }}</p>
            </div>
          }
        </div>

        <!-- Information Section -->
        <div class="info-section">
          <h2 class="info-title">{{ t().certificateSummary.saveAndShareTitle }}</h2>
          <p class="info-text">{{ t().certificateSummary.saveAndShareDescription }}</p>

          <div class="info-steps">
            <div class="step">
              <div class="step-number">1</div>
              <p class="step-text">{{ t().certificateSummary.step1 }}</p>
            </div>
            <div class="step">
              <div class="step-number">2</div>
              <p class="step-text">{{ t().certificateSummary.step2 }}</p>
            </div>
            <div class="step">
              <div class="step-number">3</div>
              <p class="step-text">{{ t().certificateSummary.step3 }}</p>
            </div>
          </div>
        </div>

        <!-- Continue Button -->
        <div class="button-section">
          <button type="button" class="continue-btn" (click)="goToCertificate()">
            {{ t().certificateSummary.continueButton }}
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .summary-page {
      min-height: 100vh;
      padding: 20px;
      background: linear-gradient(135deg, #1f6b3a 0%, #14532d 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    .summary-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 900px;
      width: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 24px;
    }

    .certificate-preview {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .preview-label {
      font-size: 14px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preview-placeholder {
      width: 100%;
      height: 300px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      background: #f9f9f9;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /*
      The certificate is A4 landscape and scales itself to whatever width it is given, so the
      preview only has to reserve that ratio. The old fixed 320px height simply cropped it.
      A padding-box ratio is used rather than 'aspect-ratio', which iOS Safari lacks before 15.
    */
    .preview-viewport {
      position: relative;
      width: 100%;
      overflow: hidden;
      border: 1px solid #dbe3d0;
      border-radius: 8px;
      background: white;
    }

    .preview-viewport::before {
      content: '';
      display: block;
      padding-top: 70.7665%;   /* 794 / 1122 */
    }

    .preview-frame {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: white;
    }

    .preview-placeholder p {
      color: #999;
      font-size: 14px;
      margin: 0;
      text-align: center;
    }

    .info-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
      background: #f7f8f0;
      border-radius: 8px;
    }

    .info-title {
      font-size: 20px;
      font-weight: 700;
      color: #1a202c;
      margin: 0;
    }

    .info-text {
      font-size: 16px;
      color: #4a5568;
      margin: 0;
      line-height: 1.6;
    }

    .info-steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
    }

    .step {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .step-number {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      background: #1f6b3a;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    .step-text {
      font-size: 14px;
      color: #4a5568;
      margin: 0;
      padding-top: 6px;
      line-height: 1.5;
    }

    .button-section {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .continue-btn {
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #1f6b3a 0%, #14532d 100%);
      color: white;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(31, 107, 58, 0.4);
    }

    .share-btn {
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      background: #0f766e;
      color: white;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(15, 118, 110, 0.35);
    }

    .share-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(15, 118, 110, 0.45);
    }

    .share-btn:active {
      transform: translateY(0);
    }

    .continue-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(31, 107, 58, 0.6);
    }

    .continue-btn:active {
      transform: translateY(0);
    }

    @media (max-width: 768px) {
      .summary-container {
        padding: 16px;
        gap: 16px;
      }

      .preview-placeholder {
        height: 200px;
      }

      .info-section {
        padding: 16px;
      }

      .info-title {
        font-size: 18px;
      }

      .info-text {
        font-size: 14px;
      }

      .continue-btn {
        width: 100%;
        padding: 12px 24px;
      }

      .share-btn {
        width: 100%;
        padding: 12px 24px;
      }
    }
  `]
})
export class CertificateSummaryComponent implements OnInit {
  private languageService = inject(LanguageService);
  private storage = inject(StorageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);

  t = this.languageService.t;
  certificatePreviewUrl: SafeResourceUrl | null = null;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const previewUrl = this.router.serializeUrl(
      this.router.createUrlTree(['/certificate'], { queryParams: { preview: '1' } })
    );
    this.certificatePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl);
  }

  /**
   * Hand over to the certificate page, where saving is an explicit tap and finishing is a
   * separate one. Downloads used to be fired automatically right after this navigation, which
   * iOS blocks — there is no user activation left by then — so certificates silently never
   * arrived, and because the reset was tied to that download the run never ended either.
   */
  goToCertificate(): void {
    this.router.navigate(['/certificate'], {
      queryParams: { reset: '1' }
    });
  }
}

