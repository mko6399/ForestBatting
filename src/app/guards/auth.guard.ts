import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { StorageService } from '../services/storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private platformId = inject(PLATFORM_ID);
  private storage = inject(StorageService);

  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    // Skip auth check during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return true;
    }

    const token = this.storage.getAuthToken();

    if (token) {
      // User has token - allow access
      return true;
    } else {
      // No token - redirect to login
      this.router.navigate(['/login']);
      return false;
    }
  }
}
