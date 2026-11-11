import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Gate the /install route behind a required query param.
 *
 * Note: this is NOT security (front-end only). It simply prevents casual discovery.
 */
export const installParamGuard: CanActivateFn = (route) => {
  const token =
    route.queryParamMap.get('token') ??
    route.queryParamMap.get('key') ??
    route.queryParamMap.get('k');

  if (token && token.trim().length > 0) {
    return true;
  }

  // No param -> behave like the page doesn't exist.
  return inject(Router).parseUrl('/login');
};
