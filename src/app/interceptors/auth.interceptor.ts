import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs';
import { StorageService } from '../services/storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const storage = inject(StorageService);

  // Admin endpoints (visitor dashboard) manage their own credentials and must
  // not get the regular user token or the auto-redirect to the normal login page.
  const isAdminRequest = req.url.includes('/Admin/') || req.url.includes('/Visitor/');

  // Get auth token from storage service
  const authToken = storage.getAuthToken();

  // Add authorization header to all requests if token exists.
  // Never overwrite an Authorization header the caller already set (e.g. admin JWT).
  if (authToken && !req.headers.has('Authorization')) {
    req = req.clone({
      setHeaders: {
        'Authorization': `Bearer ${authToken}`
      }
    });
  }

  return next(req).pipe(
    catchError((error) => {
      // Handle 401 Unauthorized errors (admin endpoints handle 401 themselves)
      if (error.status === 401 && !isAdminRequest) {
        console.error('Token expired or invalid. Please log in again.');
        // Clear stored auth data
        storage.clearAuthData();
        // Redirect to login
        router.navigate(['/login']);
      }
      throw error;
    })
  );
};
