import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitorService, VisitorStats } from '../../services/visitor.service';

const ADMIN_TOKEN_KEY = 'visitor-dashboard:admin-token';

/**
 * Visitor dashboard — shows how many unique users have entered (logged into)
 * the website, plus the stored name/email list.
 *
 * Not linked anywhere in the app navigation: it is only reachable by typing
 * the URL directly (e.g. https://.../visitor-dashboard), and it additionally
 * requires the fixed admin username/password before any data is shown.
 */
@Component({
    selector: 'app-visitor-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './visitor-dashboard.component.html',
    styleUrls: ['./visitor-dashboard.component.scss']
})
export class VisitorDashboardComponent implements OnInit {
    private visitorService = inject(VisitorService);

    stats = signal<VisitorStats | null>(null);
    loading = signal(false);
    error = signal(false);

    /** Admin login state. */
    username = '';
    password = '';
    loggingIn = signal(false);
    loginError = signal(false);
    authenticated = signal(false);

    ngOnInit(): void {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (token) {
            this.authenticated.set(true);
            this.refresh();
        }
    }

    login(): void {
        if (this.loggingIn() || !this.username || !this.password) {
            return;
        }
        this.loggingIn.set(true);
        this.loginError.set(false);
        this.visitorService.adminLogin(this.username, this.password).subscribe({
            next: (res) => {
                sessionStorage.setItem(ADMIN_TOKEN_KEY, res.token);
                this.authenticated.set(true);
                this.loggingIn.set(false);
                this.password = '';
                this.refresh();
            },
            error: () => {
                this.loginError.set(true);
                this.loggingIn.set(false);
            }
        });
    }

    logout(): void {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        this.authenticated.set(false);
        this.stats.set(null);
        this.username = '';
        this.password = '';
    }

    refresh(): void {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (!token) {
            this.authenticated.set(false);
            return;
        }
        this.loading.set(true);
        this.error.set(false);
        this.visitorService.getStats(token).subscribe({
            next: (stats) => {
                this.stats.set(stats);
                this.loading.set(false);
            },
            error: (err) => {
                this.loading.set(false);
                if (err?.status === 401 || err?.status === 403) {
                    // Token missing/expired — force a new admin login.
                    this.logout();
                    this.loginError.set(true);
                    return;
                }
                this.error.set(true);
            }
        });
    }
}
