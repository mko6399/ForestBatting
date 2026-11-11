import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService, Language } from '../../services/language.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './language-selector.component.html',
  styleUrls: ['./language-selector.component.scss']
})
export class LanguageSelectorComponent {
  @Output() languageSelected = new EventEmitter<void>();

  private languageService = inject(LanguageService);

  languages: Language[] = this.languageService.availableLanguages;
  selectedLanguage: Language | null = null;

  selectLanguage(language: Language): void {
    this.selectedLanguage = language;
  }

  confirmSelection(): void {
    if (this.selectedLanguage) {
      this.languageService.setLanguage(this.selectedLanguage.code);
      this.languageSelected.emit();
    }
  }

  isSelected(language: Language): boolean {
    return this.selectedLanguage?.code === language.code;
  }
}
