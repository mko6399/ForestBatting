import { inject, isDevMode } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavigationService } from '../services/navigation.service';

/**
 * /missions shows the mission for the checkpoint you are standing at, so it only opens while
 * a checkpoint is in range. The nav links are disabled to match, and this is the safety net
 * behind them.
 *
 * In development it lets you through instead, because the page is otherwise unreachable from
 * a desk — there is no GPS fix, so no checkpoint is ever in range. This is a routing rule for
 * a walking app, not a security boundary; the production build still enforces it.
 */
export const inRadiusGuard: CanActivateFn = () => {
  const nav = inject(NavigationService);
  const router = inject(Router);

  if (nav.getInRadius()) return true;

  if (isDevMode()) {
    console.warn(
      '[inRadiusGuard] No checkpoint in range — allowed because this is a development build. ' +
      'In production this navigation would be sent back to /map.'
    );
    return true;
  }

  router.navigate(['/map']);
  return false;
};
