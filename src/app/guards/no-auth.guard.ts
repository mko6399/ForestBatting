import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { StorageService } from '../services/storage.service';

@Injectable({
  providedIn: 'root'
})
export class NoAuthGuard implements CanActivate {
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
      // User already has token - skip login/register, go to map
      this.router.navigate(['/map']);
      return false;
    } else {
      // No token - allow access to login/register
      return true;
    }
  }
}
