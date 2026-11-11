import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LanguageService } from './language.service';

/** Minimal shapes of the lazily imported render libraries (kept loose on purpose). */
type Html2CanvasFn = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
type JsPdfCtor = new (options?: Record<string, unknown>) => any;

/** Inputs needed to render the certificate off-screen. */
export interface CertificateRenderInput {
    recipientName: string;
    language: string;
    durationMinutes: number;
    totalSteps: number;
    totalCalories: number;
    totalOxygen: number;
    totalPythaside: number;
    completedDate: string;
}

/**
 * Renders the certificate image entirely off-DOM and produces a PDF data URL.
 *
 * The certificate page renders the live element; the home stop-flow has no certificate
 * markup, so this service builds a self-contained clone at true A4 size, captures it with
 * html2canvas and wraps the PNG in an A4-landscape jsPDF document. The markup mirrors the
 * certificate component's `.exporting` layout so the emailed file matches the one the user
 * can save from the certificate page.
 */
@Injectable({ providedIn: 'root' })
export class CertificatePdfService {
    private platformId = inject(PLATFORM_ID);
    private languageService = inject(LanguageService);

    private html2canvasReady: Promise<Html2CanvasFn> | null = null;
    private jspdfReady: Promise<JsPdfCtor> | null = null;

    /**
     * Render the certificate and return it as a PDF data URL (data:application/pdf;base64,...).
     * Returns null when not in a browser, or when rendering fails — callers treat the PDF as
     * optional and still send the rest of the email.
     */
    async renderPdfDataUrl(input: CertificateRenderInput): Promise<string | null> {
        if (!isPlatformBrowser(this.platformId)) return null;

        const [html2canvas, jsPDFCtor] = await Promise.all([this.loadHtml2Canvas(), this.loadJsPdf()]);
        if (!html2canvas || !jsPDFCtor) return null;

        const host = await this.buildOffscreenCertificate(input);
        if (!host) return null;

        try {
            await this.waitForRenderAssets(host);

            const canvas = await html2canvas(host.querySelector('.certificate') as HTMLElement, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                allowTaint: false,
                useCORS: true,
                removeContainer: true
            });

            const pngDataUrl = canvas.toDataURL('image/png');

            const pdf = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = 297;
            const pageHeight = 210;
            const imgAspect = canvas.width / canvas.height;
            const pageAspect = pageWidth / pageHeight;
            let renderWidth = pageWidth;
            let renderHeight = pageHeight;
            if (imgAspect > pageAspect) {
                renderHeight = pageWidth / imgAspect;
            } else {
                renderWidth = pageHeight * imgAspect;
            }
            const x = (pageWidth - renderWidth) / 2;
            const y = (pageHeight - renderHeight) / 2;
            pdf.addImage(pngDataUrl, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');

            // Build the data URL manually: jsPDF's 'datauristring' output is unreliable and
            // can yield a malformed/blank payload. base64 encode the raw PDF bytes instead.
            const bytes = new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer);
            return 'data:application/pdf;base64,' + this.arrayBufferToBase64(bytes);
        } catch {
            return null;
        } finally {
            host.remove();
        }
    }

    /** Base64-encode bytes without blowing the call stack on large buffers. */
    private arrayBufferToBase64(bytes: Uint8Array): string {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
        }
        return btoa(binary);
    }

    /** Build a self-contained, off-screen certificate element at true A4 export size. */
    private async buildOffscreenCertificate(input: CertificateRenderInput): Promise<HTMLElement | null> {
        const t = this.languageService.t().certificatePage as any;
        const isThai = input.language === 'th';

        const host = document.createElement('div');
        host.setAttribute(
            'style',
            'position:fixed;left:-20000px;top:0;width:1122px;height:794px;overflow:hidden;' +
            'z-index:-1;pointer-events:none;'
        );

        const cert = document.createElement('div');
        cert.className = 'certificate exporting';
        cert.setAttribute('style', this.exportingStyle());
        cert.innerHTML = this.certificateHtml(input, t, isThai);
        host.appendChild(cert);
        document.body.appendChild(host);

        // Inline all images (background + logos + signature) as data URLs. Browsers defer
        // off-screen image loading, so html2canvas would otherwise capture a blank certificate.
        await this.inlineImagesAsDataUrls(host);
        return host;
    }

    /** Fetch every image the certificate uses and swap its source for a base64 data URL. */
    private async inlineImagesAsDataUrls(root: HTMLElement): Promise<void> {
        // Collect every image URL: <img src> plus the CSS background image.
        const urls = new Set<string>();
        root.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) urls.add(src);
        });
        root.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
            const match = /url\(['"]?([^'")]+)['"]?\)/.exec(el.style.backgroundImage || '');
            if (match && match[1] && !match[1].startsWith('data:')) urls.add(match[1]);
        });

        const dataUrls = new Map<string, string>();
        await Promise.all(Array.from(urls).map(async (url) => {
            const dataUrl = await this.fetchAsDataUrl(url);
            if (dataUrl) dataUrls.set(url, dataUrl);
        }));

        root.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src');
            if (src && dataUrls.has(src)) img.src = dataUrls.get(src)!;
        });
        root.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
            const match = /url\(['"]?([^'")]+)['"]?\)/.exec(el.style.backgroundImage || '');
            if (match && match[1] && dataUrls.has(match[1])) {
                el.style.backgroundImage = `url('${dataUrls.get(match[1])}')`;
            }
        });
    }

    /** Load an image as a base64 data URL, avoiding any canvas/CORS taint. */
    private fetchAsDataUrl(url: string): Promise<string | null> {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(this.imageToDataUrl(img));
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    private imageToDataUrl(img: HTMLImageElement): string | null {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
        } catch {
            return null;
        }
    }

    /** Inline the exporting layout so the clone does not depend on the page's stylesheet. */
    private exportingStyle(): string {
        return [
            'transform:none', 'position:static', 'width:1122px', 'height:794px',
            'max-width:none', 'box-sizing:border-box'
        ].join(';');
    }

    private certificateHtml(input: CertificateRenderInput, t: any, isThai: boolean): string {
        const name = this.escapeHtml(input.recipientName || '________________');
        const date = this.escapeHtml(input.completedDate);
        const titleClass = isThai ? 'cert-title th-title' : 'cert-title';
        const titleStyle = isThai ? 'letter-spacing:0;' : 'white-space:nowrap;';
        const titleText = `${this.escapeHtml(t.titleLine1)} ${this.escapeHtml(t.titleLine2 || '')}`.trim();

        return `
      <div class="cert-bg" style="width:100%;height:100%;background:url('/assets/images/certificateBG.png') no-repeat center/cover;box-sizing:border-box;position:relative;">
        <div class="cert-content" style="position:absolute;inset:0;padding:54px 66px 42px;box-sizing:border-box;text-align:center;display:flex;flex-direction:column;justify-content:space-between;gap:10px;color:#1e293b;">
          <div class="top" style="display:flex;flex-direction:column;align-items:center;padding-top:6px;">
            <div class="top-logos" style="display:flex;align-items:center;justify-content:center;flex-wrap:nowrap;gap:14px;">
              <img class="top-logo" src="/assets/images/Thaksin-logo.png" alt="" style="height:64px;width:auto;object-fit:contain;" />
              <img class="top-logo" src="/assets/images/kachonglogo.png" alt="" style="height:64px;width:auto;object-fit:contain;" />
              <img class="top-logo" src="/assets/images/Garden-logo.png" alt="" style="height:64px;width:auto;object-fit:contain;" />
            </div>
            <div class="kachong-name" style="font-weight:800;letter-spacing:1.2px;color:#a16207;font-size:16px;text-transform:uppercase;margin-top:6px;">${this.escapeHtml(t.resortNameLine1)}</div>
            <div class="kachong-sub" style="font-weight:700;letter-spacing:1.2px;color:#a16207;font-size:12px;text-transform:uppercase;margin-top:0;">${this.escapeHtml(t.resortNameLine2)}</div>
          </div>

          <h1 class="${titleClass}" style="margin:0;font-size:40px;line-height:1.05;letter-spacing:1px;color:#a16207;font-weight:900;font-family:Georgia,serif;text-transform:uppercase;${titleStyle}">
            <span>${titleText}</span>
          </h1>

          <div class="certify" style="margin-top:8px;color:#334155;font-weight:600;font-size:18px;font-family:Georgia,serif;">${this.escapeHtml(t.certifyLine)}</div>

          <div class="recipient" style="padding-top:4px;">
            <div class="recipient-name" style="margin:0 auto;font-size:46px;font-weight:900;border-bottom:2px solid rgba(15,23,42,0.35);padding-bottom:10px;width:88%;max-width:720px;word-wrap:break-word;color:#14532d;font-family:Georgia,serif;">${name}</div>
          </div>

          <div class="completion" style="color:#334155;font-weight:600;font-size:18px;line-height:1.45;max-width:820px;margin:0 auto;font-family:Georgia,serif;display:grid;gap:2px;">
            <span>${this.escapeHtml(t.completionLine1)}</span>
            <span>${this.escapeHtml(t.completionLine2)}</span>
          </div>

          <div class="stats" style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;justify-items:center;gap:10px;max-width:720px;margin:0 auto;padding-top:6px;color:#a16207;">
            ${this.statCell(this.statTimeValue(input, t))}
            <div class="stat-divider" style="display:block;width:1px;height:42px;background:rgba(161,98,7,0.3);"></div>
            ${this.statCell(`${this.formatNumber(input.totalSteps)} ${this.escapeHtml(t.statStepsSuffix)}`)}
            <div class="stat-divider" style="display:block;width:1px;height:42px;background:rgba(161,98,7,0.3);"></div>
            ${this.statCell(`${this.escapeHtml(t.statPhytoncideLabel)} ${this.formatNumber(input.totalPythaside)}`)}
          </div>

          <div class="stats stats-more" style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;justify-items:center;gap:10px;max-width:520px;margin:0 auto;padding-top:6px;color:#a16207;">
            ${this.statCell(`${this.escapeHtml(t.statCaloriesLabel)} ${this.formatNumber(input.totalCalories)}`)}
            <div class="stat-divider" style="display:block;width:1px;height:42px;background:rgba(161,98,7,0.3);"></div>
            ${this.statCell(`${this.escapeHtml(t.statOxygenLabel)} ${this.formatNumber(input.totalOxygen)}`)}
          </div>

          <div class="bottom" style="display:grid;grid-template-columns:1fr auto 1fr;align-items:flex-end;gap:16px;padding-bottom:6px;">
            <div></div>
            <div class="signer" style="text-align:center;justify-self:center;min-width:260px;">
              <img class="sign-img" src="/assets/images/sign.png" alt="" style="height:42px;width:auto;object-fit:contain;display:block;margin:0 auto 0;filter:contrast(1.2);" />
              <div class="sign-name" style="color:#14532d;font-weight:800;font-size:15px;font-family:Georgia,serif;">${this.escapeHtml(t.signerName)}</div>
              <div class="sign-title" style="color:#334155;font-weight:600;font-size:12px;margin-top:0;">${this.escapeHtml(t.signerTitle)}</div>
            </div>
            <div class="issued" style="text-align:right;min-width:160px;justify-self:end;">
              <div class="issued-value" style="color:#14532d;font-weight:800;font-size:14px;">${date}</div>
              <div class="issued-label" style="color:#334155;font-weight:600;font-size:12px;margin-top:4px;">${this.escapeHtml(t.issueDate)}</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    private statCell(text: string): string {
        return `<div class="stat" style="display:grid;justify-items:center;gap:6px;min-width:140px;">
      <div class="stat-text" style="font-weight:700;font-size:14px;color:#a16207;white-space:nowrap;font-family:Georgia,serif;">${text}</div>
    </div>`;
    }

    private statTimeValue(input: CertificateRenderInput, t: any): string {
        return `${this.formatNumber(input.durationMinutes)} ${this.escapeHtml(t.statTimeSuffix)}`;
    }

    private formatNumber(value: number): string {
        return (Math.round((value ?? 0) * 10) / 10).toLocaleString('en-US');
    }

    private escapeHtml(value: string): string {
        return (value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private async waitForRenderAssets(root: HTMLElement): Promise<void> {
        try {
            const fontsReady = (document as any).fonts?.ready as Promise<void> | undefined;
            if (fontsReady) await fontsReady;
        } catch {
            // ignore
        }

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

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    private loadHtml2Canvas(): Promise<Html2CanvasFn | null> {
        if (!isPlatformBrowser(this.platformId)) return Promise.resolve(null);
        if (!this.html2canvasReady) {
            this.html2canvasReady = import('html2canvas').then(m => (m.default ?? m) as unknown as Html2CanvasFn);
        }
        return this.html2canvasReady.catch(() => {
            this.html2canvasReady = null;
            return null as unknown as Html2CanvasFn;
        });
    }

    private loadJsPdf(): Promise<JsPdfCtor | null> {
        if (!isPlatformBrowser(this.platformId)) return Promise.resolve(null);
        if (!this.jspdfReady) {
            this.jspdfReady = import('jspdf').then(m => m.jsPDF as unknown as JsPdfCtor);
        }
        return this.jspdfReady.catch(() => {
            this.jspdfReady = null;
            return null as unknown as JsPdfCtor;
        });
    }
}
