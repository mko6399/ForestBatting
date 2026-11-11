import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { environment } from '../../environments/environment';

export interface GalleryImage {
  id: string;
  code: string;
  url: SafeUrl;
  uploadedAt: string;
  userId?: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  data: Array<{
    id: string;
    code: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    image: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private readonly API_URL = `${environment.apiUrl}/Images/my-images`;

  /**
   * Get all images uploaded by current user
   * @returns Observable of array of gallery images
   */
  getUserImages(): Observable<GalleryImage[]> {
    console.log('Fetching images from:', this.API_URL);
    return this.http.get<ApiResponse>(this.API_URL).pipe(
      map(response => {
        console.log('API Response:', response);

        // If no images, return empty array
        if (!response.data || response.data.length === 0) {
          return [];
        }

        // Transform image data - assume 'image' is base64 encoded
        const transformed = response.data.map(item => ({
          id: item.id,
          code: item.code,
          url: this.createImageUrl(item.image),
          uploadedAt: item.createdAt,
          userId: item.userId
        }));

        console.log('Transformed images:', transformed);
        return transformed;
      })
    );
  }

  /**
   * Create image URL from base64 data
   * @param imageData - Base64 encoded image data from API
   * @returns Safe URL for use in templates
   */
  private createImageUrl(imageData: string): SafeUrl {
    if (!imageData) {
      return this.sanitizer.bypassSecurityTrustUrl('');
    }

    // Check if it's already a data URL or base64
    if (imageData.startsWith('data:')) {
      console.log('Image is already a data URL');
      return this.sanitizer.bypassSecurityTrustUrl(imageData);
    }

    // If it's just base64 without the prefix, add it
    if (!imageData.startsWith('http')) {
      const dataUrl = `data:image/png;base64,${imageData}`;
      console.log('Created data URL from base64');
      return this.sanitizer.bypassSecurityTrustUrl(dataUrl);
    }

    // If it's a URL, use it as is
    return this.sanitizer.bypassSecurityTrustUrl(imageData);
  }

  /**
   * Get images by checkpoint ID
   * @param checkpointId - The checkpoint ID to filter images
   * @returns Observable of array of gallery images
   */
  getCheckpointImages(checkpointId: number): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(`${environment.apiUrl}/Images/checkpoint/${checkpointId}`);
  }

  /**
   * Delete an image
   * @param imageId - The ID of the image to delete
   * @returns Observable of delete response
   */
  deleteImage(imageId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/Images/${imageId}`);
  }
}
