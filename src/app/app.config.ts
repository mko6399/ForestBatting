import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { VersionService } from './services/version.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    /*
      Angular 22 defaults new projects to zoneless, but this app still depends on zone-based
      change detection in places: the side nav calls ChangeDetectorRef.detectChanges() on a
      timer, and Leaflet callbacks mutate component state from outside Angular. Keeping zone.js
      preserves the existing behaviour exactly; going zoneless is a separate migration.
    */
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),

    /*
      Registered here and nowhere else. The previous project also registered a worker in
      main.ts, and since SwRegistrationOptions is not a multi-provider the later one silently
      won — which defeated this isDevMode() guard and installed a worker during development.
    */
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    /*
      Runs before the first render so data left by an older version is cleared before any
      component reads it. Note that this blocks the first paint until the version request
      settles (VersionService caps it at 5s), so an unreachable API delays startup.
    */
    provideAppInitializer(() => inject(VersionService).initializeVersion()),
  ],
};
