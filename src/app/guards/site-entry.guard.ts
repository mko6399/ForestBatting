import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SiteService } from '../services/site.service';

/**
 * Entry point for the QR code at a trail's entrance: /s/<slug>.
 *
 * Visitors are standing at the location, so asking them to pick it from a list is asking a
 * question the context already answers. This selects the site and hands them straight to the
 * app. An unknown slug — a mistyped URL, or a sign for a trail that was renamed — falls back
 * to the portal rather than leaving the app pointed at nothing.
 */
export const siteEntryGuard: CanActivateFn = route => {
  const siteService = inject(SiteService);
  const router = inject(Router);

  const slug = route.paramMap.get('slug');
  const selected = slug !== null && siteService.select(slug);

  return router.createUrlTree([selected ? '/home' : '/']);
};
