import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { StorageService } from '../services/storage.service';

function allCompleted(platformId: any, storage: StorageService): boolean {
  // Skip check during SSR
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  try {
    // Pressing Continue on the post-trail prompt (or finishing the questionnaire) sets this
    // flag, which is the user's ticket to the certificate page even if not every mission is
    // marked reached.
    if (storage.getReadyToFinish()) {
      return true;
    }
    const missions = storage.getMissions();
    return Array.isArray(missions) && missions.length > 0 && missions.every((m: any) => m.reached);
  } catch {
    return false;
  }
}

export const allCompletedGuard: CanActivateFn = () => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);
  const storage = inject(StorageService);
  const ok = allCompleted(platformId, storage);
  if (!ok) router.navigate(['/map']);
  return ok;
};

