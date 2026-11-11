import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private readonly API_URL = `${environment.apiUrl}/Images/upload`;
  private readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB in bytes
  private readonly COMPRESSION_QUALITY = 0.7; // 70% quality
  private readonly MAX_WIDTH = 1920;
  private readonly MAX_HEIGHT = 1920;

  /**
   * Best-effort save of a captured photo to the user's device.
   *
   * - On mobile browsers that support the Web Share API with files, this opens the share sheet
   *   (user can choose "Save Image" / Photos / Files depending on OS).
   * - Otherwise, it triggers a download as a fallback.
   */
  async savePhotoToDevice(
    file: File,
    options?: {
      filename?: string;
      title?: string;
      text?: string;
      onlyOnMobile?: boolean;
    }
  ): Promise<'saved' | 'shared' | 'downloaded' | 'opened' | 'cancelled' | 'skipped'> {
    if (!isPlatformBrowser(this.platformId)) return 'skipped';
    if (!file) return 'skipped';

    if (options?.onlyOnMobile && !this.isMobileDevice()) return 'skipped';

    const filename = this.ensureFileExtension(
      (options?.filename || file.name || `botany_photo_${Date.now()}`).trim(),
      file.type
    );

    const fileForExport = filename === file.name
      ? file
      : new File([file], filename, { type: file.type || 'image/jpeg', lastModified: file.lastModified });

    const nav: any = navigator as any;
    const shareData: any = {
      files: [fileForExport],
      title: options?.title || 'Botany Photo',
      text: options?.text || undefined,
    };

    // Prefer a real "Save as..." picker when available (more reliable on Android Chrome/Edge).
    try {
      const anyWindow: any = window as any;
      if (typeof anyWindow?.showSaveFilePicker === 'function') {
        const handle = await anyWindow.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Image',
              accept: {
                [fileForExport.type || 'image/jpeg']: [`.${this.mimeToExtension(fileForExport.type)}`],
              },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(fileForExport);
        await writable.close();
        return 'saved';
      }
    } catch {
      // Ignore and fall back to share/download.
    }

    try {
      if (typeof nav?.share === 'function') {
        // Some browsers require canShare({ files }) to be true.
        if (typeof nav?.canShare !== 'function' || nav.canShare(shareData)) {
          await nav.share(shareData);
          return 'shared';
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Ignore and fall back to download.
    }

    return this.downloadFile(fileForExport, filename);
  }

  private isMobileDevice(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    const nav: any = navigator as any;
    if (nav?.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
      return nav.userAgentData.mobile;
    }

    const ua = (navigator.userAgent || '').toLowerCase();
    if (/android|iphone|ipad|ipod|iemobile|opera mini|mobile|mobi/.test(ua)) return true;

    // UA can be unreliable in some WebViews; coarse pointer is a good signal for phones/tablets.
    try {
      return window.matchMedia?.('(pointer: coarse)')?.matches === true;
    } catch {
      return false;
    }
  }

  private isIOS(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const ua = (navigator.userAgent || '').toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }

  /**
   * Compress an image data URL to reduce size (useful before storing in localStorage).
   */
  compressPhotoDataUrl(photoData: string): Promise<string> {
    return this.compressImage(photoData);
  }

  /**
   * Upload an image file to the server
   * @param checkpointId - The checkpoint ID associated with the image
   * @param photoData - Base64 data URL of the image
   * @param code - Code identifier for the upload (default: '2')
   * @returns Observable of the server response
   */
  uploadPhoto(checkpointId: number, photoData: string, code: string = '2'): Observable<any> {
    return new Observable(observer => {
      this.compressImage(photoData).then(compressedData => {
        const blob = this.convertBase64ToBlob(compressedData);
        const formData = this.createFormData(blob, checkpointId, code);

        // Authorization header is automatically added by auth interceptor
        this.http.post(this.API_URL, formData).subscribe(
          response => observer.next(response),
          error => observer.error(error),
          () => observer.complete()
        );
      }).catch(error => observer.error(error));
    });
  }

  /**
   * Compress image to reduce file size
   * @param photoData - Base64 data URL of the image
   * @returns Promise with compressed base64 data URL
   */
  private compressImage(photoData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = photoData;

      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          if (width > this.MAX_WIDTH || height > this.MAX_HEIGHT) {
            const ratio = Math.min(this.MAX_WIDTH / width, this.MAX_HEIGHT / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with quality compression
          canvas.toBlob(
            blob => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // If still too large, reduce quality further
              if (blob.size > this.MAX_FILE_SIZE) {
                this.compressWithQuality(canvas, blob.size).then(resolve).catch(reject);
              } else {
                const reader = new FileReader();
                reader.onload = () => {
                  resolve(reader.result as string);
                };
                reader.onerror = () => reject(new Error('Failed to read compressed image'));
                reader.readAsDataURL(blob);
              }
            },
            'image/jpeg',
            this.COMPRESSION_QUALITY
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
    });
  }

  /**
   * Further compress image by reducing quality if still too large
   */
  private compressWithQuality(canvas: HTMLCanvasElement, currentSize: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let quality = this.COMPRESSION_QUALITY - 0.1;
      const minQuality = 0.3;

      const tryCompress = (): void => {
        if (quality < minQuality) {
          // Fallback: resize to smaller dimensions
          this.resizeAndCompress(canvas, 1280, 1280).then(resolve).catch(reject);
          return;
        }

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            if (blob.size <= this.MAX_FILE_SIZE) {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(reader.result as string);
              };
              reader.onerror = () => reject(new Error('Failed to read compressed image'));
              reader.readAsDataURL(blob);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          },
          'image/jpeg',
          quality
        );
      };

      tryCompress();
    });
  }

  /**
   * Resize and compress image to specific dimensions
   */
  private resizeAndCompress(
    originalCanvas: HTMLCanvasElement,
    maxWidth: number,
    maxHeight: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ratio = Math.min(maxWidth / originalCanvas.width, maxHeight / originalCanvas.height);
      const width = Math.round(originalCanvas.width * ratio);
      const height = Math.round(originalCanvas.height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const img = new Image();
      img.src = originalCanvas.toDataURL();

      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              resolve(reader.result as string);
            };
            reader.onerror = () => reject(new Error('Failed to read compressed image'));
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.5
        );
      };

      img.onerror = () => reject(new Error('Failed to load image for resizing'));
    });
  }

  /**
   * Convert base64 data URL to Blob
   * @param photoData - Base64 data URL string
   * @returns Blob object
   */
  private convertBase64ToBlob(photoData: string): Blob {
    const arr = photoData.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }

    return new Blob([u8arr], { type: mime });
  }

  /**
   * Create FormData for the multipart request
   * @param blob - Image blob
   * @param checkpointId - Checkpoint ID
   * @param code - Code identifier
   * @returns FormData object
   */
  private createFormData(blob: Blob, checkpointId: number, code: string): FormData {
    const formData = new FormData();
    formData.append('File', blob, `checkpoint_${checkpointId}_photo.jpg`);
    formData.append('Code', code);
    formData.append('CheckpointId', String(checkpointId));
    return formData;
  }

  private async downloadFile(file: File, filename: string): Promise<'downloaded' | 'opened'> {
    const url = URL.createObjectURL(file);

    // iOS Safari often ignores the download attribute and blob URL downloads.
    // Converting to a data URL and opening it in a new tab gives the user the native
    // save/share experience that works more reliably on iPhone/iPad.
    if (this.isIOS()) {
      const dataUrl = await this.fileToDataUrl(file);
      if (dataUrl) {
        window.open(dataUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'opened';
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  }

  private fileToDataUrl(file: File): Promise<string | null> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  private ensureFileExtension(name: string, mimeType: string | undefined): string {
    // If it already has an extension, keep it.
    if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;

    const ext = this.mimeToExtension(mimeType);
    return `${name}.${ext}`;
  }

  private mimeToExtension(mimeType: string | undefined): string {
    const mt = (mimeType || '').toLowerCase();
    if (mt.includes('heic')) return 'heic';
    if (mt.includes('heif')) return 'heif';
    if (mt.includes('png')) return 'png';
    if (mt.includes('webp')) return 'webp';
    // Default for camera captures and our compression pipeline.
    return 'jpg';
  }
}
