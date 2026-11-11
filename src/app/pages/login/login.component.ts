import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  name: string = '';
  surname: string = '';
  email: string = '';
  code: string = '';
  errorMessage: string = '';
  codeErrorMessage: string = '';
  infoMessage: string = '';
  isSendingCode: boolean = false;
  isVerifying: boolean = false;
  codeSent: boolean = false;
  submittedOnce: boolean = false;
  codeSubmittedOnce: boolean = false;
  emptyFields: Set<string> = new Set();

  constructor(
    private router: Router,
    private authService: AuthService,
    public languageService: LanguageService
  ) { }

  get t() {
    return this.languageService.t();
  }

  get currentLang() {
    return this.languageService.currentLanguage().code;
  }

  switchLanguage() {
    const newLang = this.currentLang === 'en' ? 'th' : 'en';
    this.languageService.setLanguage(newLang);
  }

  private isEmailValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.infoMessage = '';
    this.submittedOnce = true;
    this.emptyFields.clear();

    // Check for empty fields
    if (!this.name) this.emptyFields.add('name');
    if (!this.surname) this.emptyFields.add('surname');
    if (!this.email) this.emptyFields.add('email');

    // Validation
    if (this.emptyFields.size > 0) {
      this.errorMessage = this.t.login.errorAllFields;
      return;
    }

    if (!this.isEmailValid(this.email)) {
      this.emptyFields.add('email');
      this.errorMessage = this.t.login.errorInvalidEmail;
      return;
    }

    // Request a verification code to be sent to the email
    this.sendCode();
  }

  private sendCode(): void {
    this.isSendingCode = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.authService.requestLoginCode(this.name, this.surname, this.email).subscribe(
      (response: any) => {
        this.isSendingCode = false;
        this.codeSent = true;
        this.codeSubmittedOnce = false;
        this.codeErrorMessage = '';
        this.infoMessage = response?.message || this.t.login.codeSentMessage;
      },
      (error: any) => {
        this.isSendingCode = false;
        console.error('❌ Send code error:', error);
        this.errorMessage = error.error?.message || 'Failed to send verification code. Please try again.';
      }
    );
  }

  resendCode(): void {
    this.code = '';
    this.sendCode();
  }

  onVerifyCode(): void {
    this.codeErrorMessage = '';
    this.codeSubmittedOnce = true;

    if (!this.code || !/^\d{6}$/.test(this.code)) {
      this.codeErrorMessage = this.t.login.errorInvalidCode;
      return;
    }

    this.isVerifying = true;

    this.authService.verifyLoginCode(this.email, this.code).subscribe(
      (response) => {
        this.isVerifying = false;
        console.log('✅ Login successful:', response);

        this.authService.storeAuthToken(response.token);
        // Prefer server-provided name; fall back to entered name/surname
        const userName = `${response.firstName || this.name} ${response.lastName || this.surname}`.trim();
        if (userName) {
          this.authService.storeUsername(userName);
        }

        // Navigate directly after login (no popup)
        this.router.navigate(['/home']);
      },
      (error: any) => {
        this.isVerifying = false;
        console.error('❌ Verify code error:', error);
        this.codeErrorMessage = error.error?.message || this.t.login.errorInvalidCode;
      }
    );
  }

  isFieldEmpty(fieldName: string): boolean {
    return this.submittedOnce && this.emptyFields.has(fieldName);
  }
}
