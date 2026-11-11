import { Injectable, inject, computed, signal, WritableSignal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, catchError, tap } from 'rxjs';
import { LanguageService } from './language.service';

// Bundled fallback for SSR/prerender (avoids server-side requests to /assets/...)
import basesBilingual from '../../assets/bases/bases-bilingual.json';

export interface BilingualText {
  th: string;
  en: string;
}

export interface BilingualTextArray {
  th: string[];
  en: string[];
}

export interface BaseQuestion {
  id: string;
  question: BilingualText | string;
  choices: Record<string, BilingualText | string>;
  correctAnswer: string;
}

export interface Question {
  id: string;
  question: string;
  choices: Record<string, string>;
  correctAnswer?: string;
}

export interface BaseData {
  id: number;
  name: BilingualText | string;
  latitude: number;
  longitude: number;
  radius?: number;
  type: 'question_forest_bathing' | 'activity_forest_bathing' | 'activity_forest_bathing_photo' | 'question_botany' | 'writing_reflection';
  randomizeActivities?: boolean;
  steps?: (BilingualText | string)[] | BilingualText | BilingualTextArray;
  notes?: (BilingualText | string)[] | BilingualText | BilingualTextArray;
  questions?: BaseQuestion[];
  activities?: (BilingualText | string)[] | BilingualText | BilingualTextArray;
  readMore?: string;
  activity?: BilingualText | string;
  certificateFields?: (BilingualText | string)[] | BilingualText | BilingualTextArray;
}

export interface Checkpoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  mission: string;
  reached: boolean;
  photo?: string;
  answer?: string;
  question?: string;
  type?: 'question_forest_bathing' | 'activity_forest_bathing' | 'activity_forest_bathing_photo' | 'question_botany' | 'writing_reflection';
  randomizeActivities?: boolean;
  readMore?: string;
  questions?: Question[];
  activities?: string[];
  steps?: string[];
  activity?: string;
  certificate?: string[];
  starEarned?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BaseDataService {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
  private languageService = inject(LanguageService);
  private readonly DATA_URL = 'assets/bases/bases-bilingual.json';
  private readonly questionCheckpointWhitelist = new Set<number>([9, 15]);

  // Cache for base data
  private basesCache: WritableSignal<BaseData[]> = signal([]);

  /**
   * Get checkpoints data as computed signal that updates with language changes
   * @returns Computed signal of checkpoints
   */
  getCheckpointsDataSignal() {
    return computed(() => {
      // Explicitly depend on languageService.currentLanguage signal
      const currentLanguageSignal = this.languageService.currentLanguage();
      const language = currentLanguageSignal.code as 'th' | 'en';
      const bases = this.basesCache();
      return bases.map(base => this.convertToCheckpoint(base, language));
    });
  }

  /**
   * Load all base data from bilingual JSON file (call once on app init)
   * @returns Observable to subscribe to for loading
   */
  loadBasesData(): Observable<BaseData[]> {
    // During SSR/prerender, relative asset HTTP requests (e.g. /assets/...) are not served,
    // so fall back to bundled JSON.
    if (!isPlatformBrowser(this.platformId)) {
      const data = (basesBilingual as unknown as BaseData[]) || [];
      this.basesCache.set(data);
      return of(data);
    }

    return this.http.get<BaseData[]>(this.DATA_URL).pipe(
      tap((data) => this.basesCache.set(data)),
      catchError(() => {
        // Browser fallback if the asset request fails (offline, misconfigured baseHref, etc.)
        const data = (basesBilingual as unknown as BaseData[]) || [];
        this.basesCache.set(data);
        return of(data);
      })
    );
  }

  /**
   * Convert single base data to checkpoint
   * @param base - Base data from JSON
   * @param language - Language code
   * @returns Checkpoint object
   */
  private convertToCheckpoint(base: BaseData, language: 'th' | 'en' = 'th'): Checkpoint {
    const keepQuestionMode = this.questionCheckpointWhitelist.has(base.id);
    const convertedFromQuestion = !keepQuestionMode && (base.type === 'question_botany' || base.type === 'question_forest_bathing');
    const checkpointType = this.getCheckpointType(base.type, keepQuestionMode);

    const baseRadius = base.radius ?? 10;
    const increasedRadius = baseRadius + 2;

    return {
      id: base.id,
      name: this.extractText(base.name, language),
      lat: base.latitude,
      lng: base.longitude,
      radius: increasedRadius,
      mission: this.extractMission(checkpointType, base.name, language),
      reached: false,
      type: checkpointType,
      randomizeActivities: base.randomizeActivities || convertedFromQuestion,
      readMore: base.readMore,
      questions: keepQuestionMode && base.questions ? this.convertQuestions(base.questions, language) : undefined,
      activities: this.extractArray(base.activities, language).map(activity => this.stripActivityPrefix(activity)),
      steps: this.extractArray(base.steps, language),
      activity: this.extractText(base.activity, language),
      certificate: this.extractArray(base.certificateFields, language)
    };
  }

  private stripActivityPrefix(text: string): string {
    return text.replace(/^\s*\d+\.\d+\s*/, '').trim();
  }

  private getCheckpointType(
    type: BaseData['type'],
    keepQuestionMode: boolean
  ): BaseData['type'] {
    const isQuestionType = type === 'question_botany' || type === 'question_forest_bathing';
    if (isQuestionType && !keepQuestionMode) {
      return 'activity_forest_bathing';
    }
    return type;
  }

  /**
   * Convert bilingual questions to language-specific questions
   * @param questions - Base questions from JSON
   * @param language - Language code
   * @returns Language-specific questions
   */
  private convertQuestions(questions: BaseQuestion[], language: 'th' | 'en'): Question[] {
    return questions.map(q => ({
      id: q.id,
      question: this.extractText(q.question, language),
      choices: this.convertChoices(q.choices, language),
      correctAnswer: q.correctAnswer
    }));
  }

  /**
   * Convert bilingual choices to language-specific choices
   * @param choices - Base choices object
   * @param language - Language code
   * @returns Language-specific choices
   */
  private convertChoices(choices: Record<string, BilingualText | string>, language: 'th' | 'en'): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in choices) {
      result[key] = this.extractText(choices[key], language);
    }
    return result;
  }

  /**
   * Extract text based on language
   * @param text - Bilingual text object or string
   * @param language - Language code
   * @returns Extracted text
   */
  private extractText(text: BilingualText | string | undefined, language: 'th' | 'en'): string {
    if (!text) return '';
    if (typeof text === 'string') return text;
    return text[language] || '';
  }

  /**
   * Extract array of texts based on language
   * @param array - Array of bilingual texts or strings, or a bilingual text object
   * @param language - Language code
   * @returns Extracted array
   */
  private extractArray(
    array: (BilingualText | string)[] | BilingualText | BilingualTextArray | undefined,
    language: 'th' | 'en'
  ): string[] {
    if (!array) return [];

    // If it's an array
    if (Array.isArray(array)) {
      return array.map(item => this.extractText(item, language));
    }

    // If it's a bilingual object, it can be either:
    // - { th: string, en: string }
    // - { th: string[], en: string[] }
    if (typeof array === 'object' && (('th' in array) || ('en' in array))) {
      const localized: unknown = (array as any)[language];
      if (Array.isArray(localized)) {
        return localized.map(v => String(v));
      }
      if (typeof localized === 'string') {
        return localized ? [localized] : [];
      }
    }

    return [];
  }

  /**
   * Generate mission text from base data
   * @param base - Base data
   * @param language - Language code
   * @returns Mission text
   */
  private extractMission(
    type: BaseData['type'],
    name: BilingualText | string,
    language: 'th' | 'en'
  ): string {
    const typeMap = {
      'question_forest_bathing': { th: 'ตอบคำถามเกี่ยวกับการอาบป่า', en: 'Answer forest bathing questions' },
      'activity_forest_bathing': { th: 'ทำกิจกรรมอาบป่า', en: 'Do forest bathing activity' },
      'activity_forest_bathing_photo': { th: 'ถ่ายภาพและทำกิจกรรมอาบป่า', en: 'Take photos and do forest bathing activity' },
      'question_botany': { th: 'ตอบคำถามพฤกษศาสตร์', en: 'Answer botany questions' },
      'writing_reflection': { th: 'เขียนบันทึกสะท้อนความคิด', en: 'Write reflection notes' }
    };

    return typeMap[type]?.[language] || this.extractText(name, language);
  }
}
