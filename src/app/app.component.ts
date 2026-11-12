import { Component, signal, WritableSignal, computed, PLATFORM_ID, inject, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SideNavComponent } from './components/side-nav/side-nav.component';
import { CommonModule } from '@angular/common';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { ConsentBannerComponent } from './components/consent-banner/consent-banner.component';
import { ForestBackdropComponent } from './components/forest-backdrop/forest-backdrop.component';
import { LanguageService } from './services/language.service';
import { StorageService } from './services/storage.service';
import { LocationTrackingService } from './services/location-tracking.service';
import { VersionService } from './services/version.service';
import { AppUpdateService } from './services/app-update.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, startWith, map } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SideNavComponent, CommonModule, LanguageSelectorComponent, ConsentBannerComponent, ForestBackdropComponent],
  template: `
    <!-- The living forest sits behind every route, shell or standalone. -->
    <app-forest-backdrop [calm]="!isStandaloneRoute()" />

    <app-language-selector
      *ngIf="showLanguageSelector()"
      (languageSelected)="onLanguageSelected()"
    ></app-language-selector>

    <div class="evaluation-overlay" *ngIf="showPreUseEvaluation()">
      <section class="evaluation-modal" role="dialog" aria-modal="true" [attr.aria-label]="t.common.preUseEvaluationTitle">
        <span class="modal-leaf" aria-hidden="true">🌿</span>
        <h2>{{ t.common.preUseEvaluationTitle }}</h2>
        <p>{{ t.common.preUseEvaluationDescription }}</p>
        <a class="evaluation-link" href="/stress-questionnaire" (click)="openStressQuestionnaire($event)">
          {{ t.common.openStressQuestionnaire }}
        </a>
        <button type="button" class="evaluation-continue" (click)="continueToLanguageSelection()">
          {{ t.common.continueToApp }}
        </button>
      </section>
    </div>

    <ng-container *ngIf="isStandaloneRoute(); else shell">
      <main class="standalone-page">
        <router-outlet></router-outlet>
      </main>
    </ng-container>

    <ng-template #shell>
      <div class="app-shell" [class.sidebar-collapsed]="isCollapsed()" [class.hide-bottom-nav]="hideBottomNav()">
        <app-side-nav
          [isOpen]="isNavOpen()"
          [collapsed]="isCollapsed()"
          [hideBottomNav]="hideBottomNav()"
          (close)="toggleNav()"
        ></app-side-nav>

        <div class="app-main" [class.has-sidebar]="true">
          <!-- Top bar -->
          <header class="app-topbar">
            <div class="app-brand">
              <span class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32"><path d="M26 5C15 5 7 10 6 19c-.4 3 .3 5.6 1.6 7.4l-3 3a1 1 0 1 0 1.4 1.4l3-3c1.8 1.3 4.4 2 7.4 1.6C25 28 27 17 26 5Z" fill="currentColor"/><path d="M21 10c-5 4.6-9 10-11.6 16.5" stroke="#0f3d24" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
              </span>
              <span class="brand-text">
                <h1 class="app-title">Forest Bathing Trail</h1>
                <span class="app-tagline">{{ currentLang() === 'th' ? 'เส้นทางอาบป่า' : 'Shinrin-yoku trail' }}</span>
              </span>
            </div>
            <div class="topbar-actions">
              <span class="app-version">v{{ versionService.currentVersion }}</span>
              <!-- Language Selector -->
              <div class="language-selector-top" role="group" aria-label="Language">
                <button class="lang-btn-small" [class.active]="currentLang() === 'en'" [attr.aria-pressed]="currentLang() === 'en'" (click)="setLanguage('en')">
                  EN
                </button>
                <button class="lang-btn-small" [class.active]="currentLang() === 'th'" [attr.aria-pressed]="currentLang() === 'th'" (click)="setLanguage('th')">
                  ไทย
                </button>
              </div>

              <button class="collapse-btn only-desktop" (click)="toggleCollapsed()" [attr.aria-pressed]="isCollapsed()" aria-label="Toggle sidebar">
                {{ isCollapsed() ? (currentLang() === 'en' ? 'Show Menu' : 'แสดงเมนู') : (currentLang() === 'en' ? 'Hide Menu' : 'ซ่อนเมนู') }}
              </button>
            </div>
          </header>

          <main class="app-content">
            @if (versionService.dataReset) {
              <div class="version-reset-banner" role="status">
                <span class="version-reset-text">{{ t.common.dataResetNotice }}</span>
                <button
                  type="button"
                  class="version-reset-close"
                  (click)="versionService.dismissDataResetNotice()"
                  [attr.aria-label]="t.common.close">&times;</button>
              </div>
            }
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>
    </ng-template>

    <!--
      Sits above every page: nothing is written to the device until this is answered.
      Held back while the language picker is up, so the consent text is read in the language
      the visitor actually chose rather than whatever the app defaulted to.
    -->
    <app-consent-banner *ngIf="!showLanguageSelector()" />
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Forest Bathing Trail';
  isNavOpen: WritableSignal<boolean> = signal(false);
  isCollapsed: WritableSignal<boolean> = signal(false);
  showLanguageSelector: WritableSignal<boolean> = signal(false);
  showPreUseEvaluation: WritableSignal<boolean> = signal(false);
  public versionService = inject(VersionService);
  private currentUrl: WritableSignal<string> = signal('');

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private languageService = inject(LanguageService);
  private storage = inject(StorageService);
  private locationTracking = inject(LocationTrackingService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private appUpdate = inject(AppUpdateService);

  isStandaloneRoute = computed(() => {
    const url = this.currentUrl();
    return (
      url === '/login' ||
      url.startsWith('/login?') ||
      url === '/install' ||
      url.startsWith('/install?') ||
      url === '/install-desktop' ||
      url.startsWith('/install-desktop?') ||
      url === '/open' ||
      url.startsWith('/open?') ||
      url === '/stress-questionnaire' ||
      url.startsWith('/stress-questionnaire?') ||
      url === '/certificate?preview=1' ||
      url.startsWith('/certificate?preview=1&') ||
      url.includes('/certificate?') && url.includes('preview=1')
    );
  });

  hideBottomNav = computed(() => {
    const url = this.currentUrl();
    return (
      url === '/login' ||
      url.startsWith('/login?') ||
      url === '/install' ||
      url.startsWith('/install?') ||
      url === '/install-desktop' ||
      url.startsWith('/install-desktop?') ||
      url === '/open' ||
      url.startsWith('/open?') ||
      url === '/stress-questionnaire' ||
      url.startsWith('/stress-questionnaire?')
    );
  });

  // Expose translations
  get t() {
    return this.languageService.t();
  }

  currentLang = computed(() => {
    return this.languageService.currentLanguage().code;
  });

  setLanguage(lang: string) {
    console.log(`[AppComponent] Clicking language button for: ${lang}`);
    console.log(`[AppComponent] Before - currentLang():`, this.currentLang());
    this.languageService.setLanguage(lang);
    console.log(`[AppComponent] After - currentLang():`, this.currentLang());
  }

  constructor() {
    // Devices keep the cached app until told otherwise; this watches for a new deploy.
    this.appUpdate.start();

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        startWith(null),
        map(() => this.router.url),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((url) => this.currentUrl.set(url));

    // First visit (or right after Finish wiped localStorage): show the language selector
    // first; the pre-trail questionnaire prompt appears once a language is chosen.
    if (this.isBrowser && this.languageService.isFirstVisit()) {
      this.showLanguageSelector.set(true);
    }
  }

  hasAlerts = computed(() => {
    if (!this.isBrowser) return false;
    if (typeof window === 'undefined') return false;

    try {
      // Check if user is in radius with incomplete mission
      const inRadius = this.storage.getInRadius() ? JSON.parse(this.storage.getInRadius()!) : false;

      if (inRadius) {
        const missions = this.storage.getMissions();
        const currentIdStr = this.storage.getCurrentCheckpointId();
        const currentId = currentIdStr ? Number(currentIdStr) : null;

        if (currentId) {
          const currentMission = missions.find((m: any) => m.id === currentId);
          if (currentMission && !currentMission.reached) {
            return true; // Has active mission
          }
        }
      }

      // Check if certificate is available
      const missions = this.storage.getMissions();
      const allComplete = Array.isArray(missions) && missions.length > 0 && missions.every((m: any) => m.reached);
      return allComplete; // Has certificate ready
    } catch {
      return false;
    }
  });

  toggleNav() {
    this.isNavOpen.update(v => !v);
    this.dispatchLayoutChanged();
  }

  toggleCollapsed() {
    this.isCollapsed.update(v => !v);
    this.dispatchLayoutChanged();
  }

  onLanguageSelected() {
    this.showLanguageSelector.set(false);
    // Language is chosen first; now offer the pre-trail stress check.
    this.showPreUseEvaluation.set(true);
  }

  continueToLanguageSelection() {
    this.showPreUseEvaluation.set(false);
  }

  openStressQuestionnaire(event: Event): void {
    event.preventDefault();
    this.showPreUseEvaluation.set(false);
    void this.router.navigate(['/stress-questionnaire']);
  }

  private dispatchLayoutChanged() {
    window.dispatchEvent(new CustomEvent('layout-changed'));
  }
}
