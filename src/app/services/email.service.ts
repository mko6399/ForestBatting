import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** One stress check-in result (before or after the trail). */
export interface StressEmailResult {
    score: number;
    level: number;
    completedAt: string;
}

/** Payload sent to the backend so it can email the user's certificate + stats. */
export interface CertificateEmailPayload {
    recipientName: string;
    email?: string;
    language: string;
    startedAt?: string;
    completedAt?: string;
    durationMinutes: number;
    totalSteps: number;
    totalCalories: number;
    totalOxygen: number;
    totalPythaside: number;
    starsEarned: number;
    completedCheckpoints: number;
    totalCheckpoints: number;
    stressBefore?: StressEmailResult | null;
    stressAfter?: StressEmailResult | null;
    /** Data URL of the rendered certificate PNG, so the backend can attach it. */
    certificateImageDataUrl?: string;
    /** Data URL of the certificate PDF, so the backend can attach it to the email. */
    certificatePdfDataUrl?: string;
}

@Injectable({
    providedIn: 'root'
})
export class EmailService {
    private http = inject(HttpClient);
    private readonly API_URL = `${environment.apiUrl}/Email/certificate`;

    /**
     * Ask the backend to email the certificate and walk stats to the signed-in user.
     * The auth interceptor attaches the bearer token, so the backend can resolve the
     * user's email from the token when `email` is omitted.
     */
    sendCertificateEmail(payload: CertificateEmailPayload): Observable<{ message?: string }> {
        return this.http.post<{ message?: string }>(this.API_URL, payload);
    }
}
