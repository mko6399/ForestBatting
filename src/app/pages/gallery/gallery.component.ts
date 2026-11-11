import { Component, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { GalleryService, GalleryImage } from '../../services/gallery.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="gallery-page">
      <div class="gallery-header">
        <button class="back-btn" (click)="goBack()">
          <span class="back-icon">←</span>
          Back
        </button>
        <h1 class="gallery-title">📸 {{ t.gallery.title || 'My Gallery' }}</h1>
        <div class="header-spacer"></div>
      </div>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <div class="spinner"></div>
        <p>Loading images...</p>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && images.length === 0">
        <div class="empty-icon">📷</div>
        <h2>{{ t.gallery.noImages || 'No Images Yet' }}</h2>
        <p>{{ t.gallery.noImagesDesc || 'Start uploading photos from missions to see them here!' }}</p>
      </div>

      <!-- Gallery Grid -->
      <div class="gallery-grid" *ngIf="!isLoading && images.length > 0">
        <div class="gallery-item" *ngFor="let image of images; let i = index" [style.animation-delay]="(i * 50) + 'ms'">
          <div class="image-container">
            <img [src]="image.url" [alt]="'Gallery image ' + image.id" class="gallery-image">
            <div class="image-overlay">
              <div class="image-info">
                <p class="upload-date">{{ formatDate(image.uploadedAt) }}</p>
              </div>
              <div class="image-actions">
                <button class="action-btn delete-btn" (click)="deleteImage(image.id)" title="Delete image">
                  🗑️
                </button>
                <button class="action-btn expand-btn" (click)="openFullImage(image)" title="View full size">
                  🔍
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="errorMessage">
        <div class="error-icon">⚠️</div>
        <p class="error-text">{{ errorMessage }}</p>
        <button class="retry-btn" (click)="loadImages()">Retry</button>
      </div>
    </section>

    <!-- Full Image Modal -->
    <div class="modal-overlay" *ngIf="selectedImage" (click)="closeFullImage()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <button class="close-btn" (click)="closeFullImage()">✕</button>
        <img [src]="selectedImage.url" [alt]="'Gallery image ' + selectedImage.id" class="modal-image">
        <div class="modal-info">
          <p class="info-label">Uploaded:</p>
          <p class="info-value">{{ formatDate(selectedImage.uploadedAt) }}</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .gallery-page {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
      min-height: 100vh;
    }

    .gallery-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s ease;
    }

    .back-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .back-icon {
      font-size: 18px;
    }

    .gallery-title {
      font-size: 28px;
      font-weight: 800;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-spacer {
      width: 100px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
      color: white;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 80px 20px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 12px;
    }

    .empty-state p {
      font-size: 16px;
      color: #64748b;
      margin: 0;
    }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .gallery-item {
      animation: fadeInUp 0.6s ease-out forwards;
      opacity: 0;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .image-container {
      position: relative;
      overflow: hidden;
      border-radius: 16px;
      aspect-ratio: 1 / 1;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      transition: transform 0.3s ease;
    }

    .image-container:hover {
      transform: translateY(-8px);
    }

    .gallery-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .image-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .image-container:hover .image-overlay {
      opacity: 1;
    }

    .image-info {
      color: white;
    }

    .checkpoint-label {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 4px;
      opacity: 0.9;
    }

    .upload-date {
      font-size: 12px;
      margin: 0;
      opacity: 0.8;
    }

    .image-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .action-btn {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      backdrop-filter: blur(4px);
    }

    .action-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }

    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.4);
    }

    .expand-btn:hover {
      background: rgba(34, 197, 94, 0.4);
    }

    .error-state {
      text-align: center;
      padding: 60px 20px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .error-text {
      font-size: 16px;
      color: #dc2626;
      margin: 0 0 20px;
    }

    .retry-btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .retry-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 20px;
      animation: fadeIn 0.3s ease-in-out;
    }

    .modal-content {
      position: relative;
      background: white;
      border-radius: 20px;
      max-width: 600px;
      width: 100%;
      overflow: hidden;
      animation: slideUp 0.3s ease-out;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10;
    }

    .close-btn:hover {
      background: rgba(0, 0, 0, 0.7);
      transform: scale(1.1);
    }

    .modal-image {
      width: 100%;
      height: auto;
      display: block;
      max-height: 70vh;
      object-fit: contain;
    }

    .modal-info {
      padding: 20px;
      background: #f8fafc;
    }

    .info-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin: 0 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 16px;
      color: #1e293b;
      margin: 0 0 16px;
      font-weight: 500;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        transform: translateY(30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @media (max-width: 768px) {
      .gallery-header {
        flex-direction: column;
        gap: 16px;
      }

      .header-spacer {
        display: none;
      }

      .gallery-title {
        font-size: 24px;
      }

      .gallery-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
      }

      .modal-content {
        border-radius: 12px;
      }
    }
  `]
})
export class GalleryComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private galleryService = inject(GalleryService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  public languageService = inject(LanguageService);

  images: GalleryImage[] = [];
  isLoading = false;
  errorMessage = '';
  selectedImage: GalleryImage | null = null;

  get t() {
    return this.languageService.t();
  }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadImages();
  }

  loadImages(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.galleryService.getUserImages().subscribe({
      next: (images) => {
        console.log('Gallery images received:', images);
        this.images = images;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load gallery images:', error);
        this.errorMessage = 'Failed to load images. Please try again.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteImage(imageId: string): void {
    if (confirm('Are you sure you want to delete this image?')) {
      this.galleryService.deleteImage(imageId).subscribe({
        next: () => {
          this.images = this.images.filter(img => img.id !== imageId);
        },
        error: (error) => {
          console.error('Failed to delete image:', error);
          alert('Failed to delete image. Please try again.');
        }
      });
    }
  }

  openFullImage(image: GalleryImage): void {
    this.selectedImage = image;
  }

  closeFullImage(): void {
    this.selectedImage = null;
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }

  goBack(): void {
    this.router.navigate(['/map']);
  }
}
