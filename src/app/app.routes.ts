import { Routes } from '@angular/router';
import { MapComponent } from './pages/map/map.component';
import { MissionsComponent } from './pages/missions/missions.component';
import { AuthGuard } from './guards/auth.guard';
import { NoAuthGuard } from './guards/no-auth.guard';
import { installParamGuard } from './guards/install-param.guard';
import { siteEntryGuard } from './guards/site-entry.guard';
import { inRadiusGuard } from './guards/in-radius.guard';
import { allCompletedGuard } from './guards/all-completed.guard';

export const routes: Routes = [
  {
    // QR-code entry point. It leaves normal browsers on the requested app page
    // and gives in-app browsers a way to hand the link to the device browser.
    path: 'open',
    loadComponent: () => import('./pages/open-browser/open-browser.component')
      .then(m => m.OpenBrowserComponent)
  },
  {
    path: 'install',
    loadComponent: () => import('./pages/install/install.component')
      .then(m => m.InstallComponent),
    canActivate: [installParamGuard]
  },
  {
    path: 'stress-questionnaire',
    loadComponent: () => import('./pages/stress-questionnaire/stress-questionnaire.component')
      .then(m => m.StressQuestionnaireComponent)
  },
  {
    // Desktop install page. Not linked anywhere in the app — a deep link you
    // hand out on purpose (e.g. https://.../install-desktop).
    path: 'install-desktop',
    loadComponent: () => import('./pages/install-desktop/install-desktop.component')
      .then(m => m.InstallDesktopComponent)
  },
  {
    /*
      Walking the trail needs no account: QR → Start → Allow location → walking.
      Signing in moved to the end, where it is actually needed (name on the certificate,
      address to email it to) — see AuthGuard on the certificate routes below.
    */
    path: 'home',
    loadComponent: () => import('./pages/home/home.component')
      .then(m => m.HomeComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component')
      .then(m => m.LoginComponent),
    canActivate: [NoAuthGuard]
  },
  {
    path: 'mobile',
    loadComponent: () => import('./pages/mobile-page/mobile-page.component')
      .then(m => m.MobilePageComponent),
  },
  {
    path: 'map',
    component: MapComponent,
  },
  {
    path: 'missions',
    component: MissionsComponent,
    /*
      Imported statically and listed directly. Two earlier shapes were both wrong:
      `() => import(...).then(m => m.guard)` handed Angular the function rather than a result,
      so the check never ran and /missions opened with no checkpoint nearby; calling the guard
      inside .then() instead runs it outside the injection context, so its inject() calls throw
      NG0203. Both guard files are under 1.2kB — there was nothing to gain from lazy loading.
    */
    canActivate: [inRadiusGuard],
  },
  {
    path: 'certificate-summary',
    loadComponent: () => import('./pages/certificate-summary/certificate-summary.component')
      .then(m => m.CertificateSummaryComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'certificate',
    loadComponent: () => import('./pages/certificate/certificate.component')
      .then(m => m.CertificateComponent),
    /* Static for the same reason as /missions above. */
    canActivate: [AuthGuard, allCompletedGuard],
  },
  {
    // Hidden visitor dashboard. Not linked anywhere in the app — only
    // reachable by typing the URL directly (e.g. https://.../visitor-dashboard).
    path: 'visitor-dashboard',
    loadComponent: () => import('./pages/visitor-dashboard/visitor-dashboard.component')
      .then(m => m.VisitorDashboardComponent)
  },
  {
    /*
      Device readiness check: browser, GPS, storage, screen wake lock, install. Open to everyone
      (no login) so staff at the entrance can run it on a visitor's phone.
    */
    path: 'check',
    loadComponent: () => import('./pages/device-check/device-check.component')
      .then(m => m.DeviceCheckComponent)
  },
  {
    path: 'gallery',
    loadComponent: () => import('./pages/gallery/gallery.component')
      .then(m => m.GalleryComponent),
    canActivate: [AuthGuard]
  },
  {
    /*
      QR deep link printed on the sign at each trail entrance: /s/kachong, /s/thungkhai, ...
      The guard always redirects, so this route needs no component of its own.
    */
    path: 's/:slug',
    canActivate: [siteEntryGuard],
    children: [],
  },
  {
    /* Choosing a location is the way in for anyone who did not scan a QR code. */
    path: '',
    loadComponent: () => import('./pages/portal/portal.component')
      .then(m => m.PortalComponent),
    pathMatch: 'full',
  },
];
