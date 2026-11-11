import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { DEFAULT_SITE_SLUG, SITES, Site, findSite } from '../config/sites.config';

/**
 * Key for the chosen site. Deliberately NOT scoped by site (see StorageService) — it is the
 * value that decides the scope, so scoping it would make it unreadable on the next load.
 */
const LS_CURRENT_SITE = 'app.currentSite';

/**
 * Which forest-bathing location the app is currently showing.
 *
 * This service owns the selection and nothing else: it talks to localStorage directly rather
 * than through StorageService, because StorageService asks this service for the prefix it
 * uses — routing it the other way would be a cycle.
 */
@Injectable({ providedIn: 'root' })
export class SiteService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly _current = signal<Site | null>(null);

  /** Every location, including the ones not open yet. */
  readonly all = SITES;

  /** The selected site, or null before anything has been chosen. */
  readonly current = computed(() => this._current());

  /** True once a site has been picked, so the portal knows whether to show. */
  readonly hasSelection = computed(() => this._current() !== null);

  /**
   * Prefix used to keep each location's progress apart. Falls back to the default site so a
   * stray read before selection still lands somewhere predictable rather than throwing.
   */
  readonly slug = computed(() => this._current()?.slug ?? DEFAULT_SITE_SLUG);

  constructor() {
    if (!this.isBrowser) return;
    this._current.set(findSite(this.read()));
  }

  /**
   * Choose a location. Returns false for an unknown slug so a bad QR code or a mistyped URL
   * falls back to the portal instead of leaving the app in a half-configured state.
   */
  select(slug: string): boolean {
    const site = findSite(slug);
    if (!site) return false;

    this._current.set(site);
    this.write(site.slug);
    this.applyTheme(site);
    return true;
  }

  /** Forget the selection and go back to the portal. */
  clearSelection(): void {
    this._current.set(null);
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(LS_CURRENT_SITE);
    } catch {
      // Nothing to do; the signal is already cleared for this session.
    }
  }

  /** Whether this location has content to walk yet. */
  isOpen(site: Site): boolean {
    return site.status === 'open';
  }

  /**
   * Paint the browser chrome in the location's colour. Each trail has its own identity, and
   * on a phone the address bar is the largest piece of UI we do not otherwise control.
   */
  private applyTheme(site: Site): void {
    if (!this.isBrowser) return;
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', site.theme.primary);
      document.documentElement.style.setProperty('--site-primary', site.theme.primary);
      document.documentElement.style.setProperty('--site-surface', site.theme.surface);
    } catch {
      // Theming is decoration; never let it break navigation.
    }
  }

  private read(): string | null {
    try {
      return localStorage.getItem(LS_CURRENT_SITE);
    } catch {
      return null;
    }
  }

  private write(slug: string): void {
    try {
      localStorage.setItem(LS_CURRENT_SITE, slug);
    } catch {
      // Private mode or a full quota: the choice simply will not survive a reload.
    }
  }
}
