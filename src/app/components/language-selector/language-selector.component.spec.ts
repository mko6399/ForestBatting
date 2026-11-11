import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageSelectorComponent } from './language-selector.component';
import { LanguageService } from '../../services/language.service';

describe('LanguageSelectorComponent', () => {
  let component: LanguageSelectorComponent;
  let fixture: ComponentFixture<LanguageSelectorComponent>;
  let languageService: LanguageService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LanguageSelectorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LanguageSelectorComponent);
    component = fixture.componentInstance;
    languageService = TestBed.inject(LanguageService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load available languages', () => {
    expect(component.languages.length).toBeGreaterThan(0);
  });

  it('should select a language when clicked', () => {
    const language = component.languages[0];
    component.selectLanguage(language);
    expect(component.selectedLanguage).toBe(language);
  });

  it('should emit event when language is confirmed', () => {
    spyOn(component.languageSelected, 'emit');
    const language = component.languages[0];
    component.selectLanguage(language);
    component.confirmSelection();
    expect(component.languageSelected.emit).toHaveBeenCalled();
  });

  it('should not confirm without selecting a language', () => {
    spyOn(component.languageSelected, 'emit');
    component.confirmSelection();
    expect(component.languageSelected.emit).not.toHaveBeenCalled();
  });
});
