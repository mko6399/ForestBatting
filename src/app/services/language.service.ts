import { Injectable, signal, WritableSignal, PLATFORM_ID, inject, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageService } from './storage.service';
import { translations } from './translations';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private storage = inject(StorageService);

  private readonly STORAGE_KEY = 'selectedLanguage';
  private readonly FIRST_VISIT_KEY = 'hasSelectedLanguage';

  // Available languages
  readonly availableLanguages: Language[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  ];

  currentLanguage: WritableSignal<Language> = signal(this.availableLanguages[0]);

  // Computed signal for translations
  public t = computed(() => {
    const langCode = this.currentLanguage().code as 'en' | 'th';
    return translations[langCode] || translations.en;
  });

  constructor() {
    if (this.isBrowser) {
      this.loadLanguage();
    }
  }

  /**
   * Check if this is the user's first visit (no language selected yet)
   */
  isFirstVisit(): boolean {
    if (!this.isBrowser) return false;

    try {
      return !this.storage.getItem(this.FIRST_VISIT_KEY);
    } catch {
      return false;
    }
  }

  /**
   * Load the selected language from localStorage
   */
  private loadLanguage(): void {
    if (!this.isBrowser) return;

    try {
      const saved = this.storage.getItem(this.STORAGE_KEY);
      if (saved) {
        const language = this.availableLanguages.find(l => l.code === saved);
        if (language) {
          this.currentLanguage.set(language);
          console.log(`[LanguageService] Loaded language: ${language.code}`);
          return;
        }
      }
      // If no saved language, check browser language
      const browserLang = navigator.language?.split('-')[0];
      if (browserLang === 'th') {
        const thLang = this.availableLanguages.find(l => l.code === 'th');
        if (thLang) {
          this.currentLanguage.set(thLang);
          console.log('[LanguageService] Set to Thai based on browser language');
        }
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  }

  /**
   * Set the current language and save to localStorage
   */
  setLanguage(languageCode: string): void {
    console.log(`[LanguageService] setLanguage called with: ${languageCode}`);
    const language = this.availableLanguages.find(l => l.code === languageCode);
    if (language) {
      console.log(`[LanguageService] Found language object:`, language);
      console.log(`[LanguageService] Current language before: ${this.currentLanguage().code}`);

      // Set the signal - this should trigger all computed values that depend on it
      this.currentLanguage.set(language);

      console.log(`[LanguageService] Current language after: ${this.currentLanguage().code}`);

      if (this.isBrowser) {
        try {
          this.storage.setItem(this.STORAGE_KEY, languageCode);
          this.storage.setItem(this.FIRST_VISIT_KEY, 'true');
          console.log(`[LanguageService] Saved language to storage: ${languageCode}`);
        } catch (error) {
          console.error('Error saving language:', error);
        }
      }
    } else {
      console.warn(`[LanguageService] Language not found: ${languageCode}`);
    }
  }

  /**
   * Get the current language code
   */
  getCurrentLanguageCode(): string {
    return this.currentLanguage().code;
  }

  /**
   * Mark that the user has selected a language (for first visit flag)
   */
  markLanguageSelected(): void {
    if (!this.isBrowser) return;

    try {
      this.storage.setItem(this.FIRST_VISIT_KEY, 'true');
    } catch (error) {
      console.error('Error marking language selected:', error);
    }
  }
}
