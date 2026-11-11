import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface VisitorEntry {
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
}

export interface VisitorStats {
    totalVisitors: number;
    visitors: VisitorEntry[];
}

export interface AdminLoginResponse {
    token: string;
    expiresAt: string;
}

@Injectable({
    providedIn: 'root'
})
export class VisitorService {
    constructor(private http: HttpClient) { }

    /**
     * Logs in with the fixed admin credentials (POST /Admin/login)
     */
    adminLogin(username: string, password: string): Observable<AdminLoginResponse> {
        return this.http.post<AdminLoginResponse>(`${environment.apiUrl}/Admin/login`, { username, password });
    }

    /**
     * Fetches the public visitor count for the home page (GET /Visitor/count, no auth)
     */
    getCount(): Observable<{ totalVisitors: number }> {
        return this.http.get<{ totalVisitors: number }>(`${environment.apiUrl}/Visitor/count`);
    }

    /**
     * Fetches visitor stats for the dashboard (GET /Visitor/stats, requires admin JWT)
     */
    getStats(adminToken: string): Observable<VisitorStats> {
        const headers = new HttpHeaders({ Authorization: `Bearer ${adminToken}` });
        return this.http.get<VisitorStats>(`${environment.apiUrl}/Visitor/stats`, { headers });
    }
}
