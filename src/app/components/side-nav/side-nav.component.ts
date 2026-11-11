import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavigationService } from '../../services/navigation.service';
import { LanguageService } from '../../services/language.service';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside class="sidebar" [class.open]="isOpen" [class.collapsed]="collapsed">
      <div class="brand">
        <div class="logo">🌿</div>
        <div class="name">Forest Bathing Trail</div>
        <button class="close" (click)="requestClose()" aria-label="Close menu">×</button>
      </div>
      <nav class="nav">
        <a routerLink="/home" routerLinkActive="active" (click)="requestClose()" [class.disabled]="certificateOnly">
          <span class="icon" aria-hidden="true">
            <svg class="bi" viewBox="0 0 16 16" focusable="false">
              <path d="M2 7.5 8 2l6 5.5" />
              <path d="M3.5 6.5V14h9V6.5" />
              <path d="M6.5 14V10h3v4" />
            </svg>
          </span>
          <span>{{ t().nav.home }}</span>
        </a>
        <a routerLink="/map" routerLinkActive="active" (click)="requestClose()" [class.disabled]="certificateOnly">
          <span class="icon" aria-hidden="true">
            <svg class="bi" viewBox="0 0 16 16" focusable="false">
              <path d="M8 15s5-5.33 5-9A5 5 0 0 0 3 6c0 3.67 5 9 5 9Z" />
              <path d="M8 8.25A2.25 2.25 0 1 0 8 3.75a2.25 2.25 0 0 0 0 4.5Z" />
            </svg>
          </span>
          <span>{{ t().nav.map }}</span>
        </a>
        <!--
          Dimmed away from a checkpoint, matching inRadiusGuard. The link used to be offered
          unconditionally and the guard bounced the tap back to /map with no explanation.
        -->
        <a routerLink="/missions" routerLinkActive="active" (click)="requestClose()" class="mission-link"
           [class.disabled]="certificateOnly || !isMissionsEnabled"
           [attr.title]="isMissionsEnabled ? null : missionsHint()">
          <span class="icon" aria-hidden="true">
            <svg class="bi" viewBox="0 0 16 16" focusable="false">
              <path d="M3 2.5h10A1.5 1.5 0 0 1 14.5 4v9A1.5 1.5 0 0 1 13 14.5H3A1.5 1.5 0 0 1 1.5 13V4A1.5 1.5 0 0 1 3 2.5Z" />
              <path d="m4.5 8 2 2 5-5" />
            </svg>
          </span>
          <span>{{ t().nav.missions }}</span>
          <span class="alert-badge" *ngIf="showMissionAlert()">!</span>
        </a>
        <a routerLink="/certificate" routerLinkActive="active" (click)="onCertificateClick()"  class="certificate-link">
          <span class="icon" aria-hidden="true">
            <svg class="bi" viewBox="0 0 16 16" focusable="false">
              <path d="M4 1.5h6.5L13.5 4v10A1.5 1.5 0 0 1 12 15.5H4A1.5 1.5 0 0 1 2.5 14V3A1.5 1.5 0 0 1 4 1.5Z" />
              <path d="M10.5 1.5V4H13.5" />
              <path d="M5 7h6" />
              <path d="M5 9h6" />
              <path d="M5 11h4" />
            </svg>
          </span>
          <span>{{ t().nav.certificate }}</span>
          <span class="alert-badge certificate-badge" *ngIf="isCertificateEnabled">!</span>
        </a>
      </nav>
    </aside>

    <!-- Mobile bottom navigation (replaces sidebar on small screens) -->
    <nav *ngIf="!hideBottomNav" class="bottom-nav" aria-label="Bottom navigation">
      <a routerLink="/home" routerLinkActive="active" class="home-item" aria-label="Home" [class.disabled]="certificateOnly">
        <span class="icon-wrap">
          <svg class="bi" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M2 7.5 8 2l6 5.5" />
            <path d="M3.5 6.5V14h9V6.5" />
            <path d="M6.5 14V10h3v4" />
          </svg>
        </span>
        <span class="label">{{ t().nav.home }}</span>
      </a>
      <span class="bottom-separator" aria-hidden="true"></span>
      <a routerLink="/map" routerLinkActive="active" class="nav-item" aria-label="Map" [class.disabled]="certificateOnly">
        <span class="icon-wrap">
          <svg class="bi" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 15s5-5.33 5-9A5 5 0 0 0 3 6c0 3.67 5 9 5 9Z" />
            <path d="M8 8.25A2.25 2.25 0 1 0 8 3.75a2.25 2.25 0 0 0 0 4.5Z" />
          </svg>
        </span>
        <span class="label">{{ t().nav.map }}</span>
      </a>
      <a routerLink="/missions" routerLinkActive="active" class="nav-item mission-item" aria-label="Missions"
         [class.disabled]="certificateOnly || !isMissionsEnabled"
         [attr.title]="isMissionsEnabled ? null : missionsHint()">
        <span class="icon-wrap">
          <svg class="bi" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3 2.5h10A1.5 1.5 0 0 1 14.5 4v9A1.5 1.5 0 0 1 13 14.5H3A1.5 1.5 0 0 1 1.5 13V4A1.5 1.5 0 0 1 3 2.5Z" />
            <path d="m4.5 8 2 2 5-5" />
          </svg>
        </span>
        <span class="label">{{ t().nav.missions }}</span>
        <span class="alert-badge" *ngIf="showMissionAlert()">!</span>
      </a>
      <a routerLink="/certificate" routerLinkActive="active" class="nav-item certificate-item" aria-label="Certificate" (click)="onCertificateClick()">
        <span class="icon-wrap">
          <svg class="bi" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 1.5h6.5L13.5 4v10A1.5 1.5 0 0 1 12 15.5H4A1.5 1.5 0 0 1 2.5 14V3A1.5 1.5 0 0 1 4 1.5Z" />
            <path d="M10.5 1.5V4H13.5" />
            <path d="M5 7h6" />
            <path d="M5 9h6" />
            <path d="M5 11h4" />
          </svg>
        </span>
        <span class="label">{{ t().nav.certificate }}</span>
        <span class="alert-badge certificate-badge" *ngIf="isCertificateEnabled">!</span>
      </a>
    </nav>

    <div class="overlay" *ngIf="isOpen" (click)="requestClose()"></div>
  `,
  styles: [`
    :host { display:block; }
    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0; width: 260px;
      background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.12);
      transform: translateX(-105%); transition: transform .25s ease;
      z-index: 3000; border-right: 1px solid #edf2f7;
    }
    .sidebar.open { transform: translateX(0); }
    @media (max-width: 767.98px) {
      .sidebar { display:none; }
    }
    @media (min-width: 768px) {
      .sidebar { transform: none; }
    }
    .brand { display:flex; align-items:center; gap:10px; padding:16px 18px; border-bottom:1px solid #f1f5f9; }
    .brand .logo { width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:#e6f4ea; border-radius:10px; font-size:18px; }
    .brand .name { font-weight:700; color:#1f2937; }
    .brand .close { margin-left:auto; border:none; background:transparent; font-size:24px; line-height:1; display:inline-block; cursor:pointer; color:#64748b; }
    @media (min-width: 768px) { .brand .close { display:none; } }
    .nav { display:flex; flex-direction:column; padding:10px; }
  .nav a { display:flex; align-items:center; gap:10px; padding:10px 12px; margin:4px 6px; color:#334155; text-decoration:none; border-radius:10px; transition: background .2s, color .2s; }
    .nav a:hover { background:#f8fafc; }
    .nav a.active { background:#e6f4ea; color:#166534; font-weight:600; }
    .nav .icon { width:22px; text-align:center; }
    .nav a.disabled { pointer-events:none; opacity:.5; }
    .mission-link { position: relative; }
    .certificate-link { position: relative; }

    /* Mobile bottom nav */
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: calc(env(safe-area-inset-bottom));
      height: 64px;
      padding: 8px 10px;
      display: grid;
      grid-template-columns: auto 1px 1fr 1fr 1fr;
      gap: 6px;
      align-items: center;
      background: #ffffff;
      border-top: 1px solid #eef2f6;
      z-index: 2500;
    }
    .bottom-separator {
      width: 1px;
      height: 38px;
      background: #eef2f6;
      justify-self: center;
    }
    .bottom-nav a {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 48px;
      // padding: 6px 8px;
      text-decoration: none;
      color: #64748b;
      border-radius: 12px;
      transition: background .2s, color .2s;
      min-width: 0;
    }
    .icon-wrap {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      transition: background .2s ease;
    }
    .bi {
      width: 20px;
      height: 20px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bottom-nav a .label {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .bottom-nav a.active { color:#166534; }
    .bottom-nav a.active .icon-wrap { background:#e6f4ea; }
    .bottom-nav a.disabled { pointer-events:none; opacity:.5; }
    .home-item { padding-inline: 12px; }
    .mission-item, .certificate-item { position: relative; }

    /* Badges on compact bottom-nav items */
    .bottom-nav .alert-badge {
      top: 2px;
      right: 10px;
      width: 18px;
      height: 18px;
      font-size: 12px;
    }

    /* Hide bottom nav on desktop */
    @media (min-width: 768px) {
      .bottom-nav { display:none; }
    }
    .alert-badge {
      position: absolute;
      top: 6px;
      right: 12px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      font-weight: 800;
      font-size: 14px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
      animation: pulse-alert 1.5s ease-in-out infinite;
    }
    @keyframes pulse-alert {
      0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4); }
      50% { transform: scale(1.1); box-shadow: 0 4px 16px rgba(239, 68, 68, 0.6); }
    }
    .certificate-badge {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
      animation: pulse-certificate 1.5s ease-in-out infinite;
    }
    @keyframes pulse-certificate {
      0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4); }
      50% { transform: scale(1.1); box-shadow: 0 4px 16px rgba(34, 197, 94, 0.6); }
    }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index: 2900; }
    @media (min-width: 768px) { .overlay { display:none; } }
    @media (max-width: 767.98px) { .overlay { display:none; } }
    @media (min-width: 768px) {
      .sidebar { transform: translateX(0); }
      .sidebar.collapsed { transform: translateX(-105%); }
    }
  `]
})
export class SideNavComponent implements OnInit, OnDestroy {
  @Input() isOpen: boolean = false;
  @Input() collapsed: boolean = false;
  @Input() hideBottomNav: boolean = false;
  @Output() close = new EventEmitter<void>();
  isMissionsEnabled = false;
  isCertificateEnabled = false;
  certificateOnly = false;
  private refreshInterval: any;

  constructor(
    private nav: NavigationService,
    private cdr: ChangeDetectorRef,
    private languageService: LanguageService,
    private storage: StorageService
  ) { }

  // Expose translations
  t() {
    return this.languageService.t();
  }

  requestClose() { this.close.emit(); }

  /**
   * The certificate link is always reachable. Opening it ends certificate-only mode so the
   * rest of the menu is restored once the user has seen their certificate.
   */
  onCertificateClick(): void {
    this.storage.setCertificateOnlyMode(false);
    this.certificateOnly = false;
    this.requestClose();
  }

  /** Why the Missions link is dimmed, shown on hover/long-press. */
  missionsHint(): string {
    return this.languageService.currentLanguage().code === 'th'
      ? 'เดินไปให้ถึงจุดเช็คพอยต์ก่อน จึงจะเปิดภารกิจได้'
      : 'Walk to a checkpoint to open its mission.';
  }

  showMissionAlert(): boolean {
    // Show alert badge only if:
    // 1. User is in radius
    // 2. Current checkpoint is NOT completed
    if (!this.isMissionsEnabled) return false;
    if (typeof window === 'undefined') return false;

    try {
      const currentId = this.nav.getCurrentCheckpointId();
      if (!currentId) return false;

      const missions = this.storage.getMissions();
      const currentMission = missions.find((m: any) => m.id === currentId);

      // Show badge only if mission exists and is NOT reached
      return currentMission && !currentMission.reached;
    } catch {
      return false;
    }
  }

  ngOnInit(): void {
    this.refreshState();
    // Listen to storage changes (other tabs or services)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', () => this.refreshState());
      // Refresh state every second to catch mission completion
      this.refreshInterval = setInterval(() => {
        this.refreshState();
        this.cdr.detectChanges();
      }, 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private refreshState() {
    if (typeof window === 'undefined') {
      this.isMissionsEnabled = false;
      this.isCertificateEnabled = false;
      this.certificateOnly = false;
      return;
    }

    try {
      this.certificateOnly = this.storage.getCertificateOnlyMode();
      const val = this.storage.getInRadius();
      this.isMissionsEnabled = val ? JSON.parse(val) : false;
      const missions = this.storage.getMissions();
      this.isCertificateEnabled = Array.isArray(missions) && missions.length > 0 && missions.every((m: any) => m.reached);
    } catch {
      this.isMissionsEnabled = false;
      this.isCertificateEnabled = false;
      this.certificateOnly = false;
    }
  }
}
