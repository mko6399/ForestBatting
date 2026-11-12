import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, NgZone, inject } from '@angular/core';
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
        <div class="logo" aria-hidden="true">🌿</div>
        <div class="name">
          <strong>Forest Bathing Trail</strong>
          <small>{{ isTh() ? 'เส้นทางอาบป่า' : 'Forest bathing trail' }}</small>
        </div>
        <button class="close" (click)="requestClose()" aria-label="Close menu">×</button>
      </div>
      <p class="section-label">{{ isTh() ? 'เมนูหลัก' : 'Main menu' }}</p>
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

      <svg class="sidebar-forest" viewBox="0 0 272 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path class="t" d="M30 120 L30 100 L10 100 L34 62 L18 62 L40 26 L62 62 L46 62 L70 100 L50 100 L50 120Z"/>
        <path class="t" d="M110 120 L110 84 C80 84 72 54 96 44 C96 20 132 14 140 36 C166 34 172 70 146 80 L120 84 L120 120Z"/>
        <path class="t" d="M190 120 L190 96 L168 96 L196 50 L180 50 L204 8 L228 50 L212 50 L240 96 L218 96 L218 120Z"/>
        <path class="t" d="M258 120 L258 92 C236 90 232 66 252 60 C254 40 282 38 286 58 L286 120Z"/>
        <path d="M0 112 C60 104 120 116 180 108 C220 103 250 110 272 106 L272 120 L0 120Z"/>
      </svg>
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
        <span class="label">{{ isTh() ? 'เกียรติบัตร' : t().nav.certificate }}</span>
        <span class="alert-badge certificate-badge" *ngIf="isCertificateEnabled">!</span>
      </a>
    </nav>

    <div class="overlay" *ngIf="isOpen" (click)="requestClose()"></div>
  `,
  styles: [`
    :host { display:block; }

    /* ---- desktop sidebar: a dark canopy panel ------------------------- */
    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0; width: 272px;
      display: flex; flex-direction: column;
      background: var(--g-canopy);
      color: #f4f1e3;
      box-shadow: 6px 0 28px rgba(10, 31, 20, .25);
      transform: translateX(-105%); transition: transform var(--t-base) var(--ease-settle);
      z-index: 3000;
      overflow: hidden;
    }
    .sidebar.open { transform: translateX(0); }
    @media (max-width: 767.98px) { .sidebar { display:none; } }
    @media (min-width: 768px) { .sidebar { transform: none; } }

    .brand {
      display:flex; align-items:center; gap:12px;
      height: 64px; box-sizing: border-box; flex: none;
      padding: 0 18px;
      border-bottom: 2px solid rgba(232, 179, 60, .55);
      background: rgba(0, 0, 0, .18);
    }
    .brand .logo {
      width:40px; height:40px; flex:none;
      display:grid; place-items:center;
      background: var(--g-sun); border-radius:12px; font-size:20px;
      box-shadow: inset 0 -2px 0 rgba(0,0,0,.12);
    }
    .brand .name { display:flex; flex-direction:column; min-width:0; }
    .brand .name strong { font-family: var(--f-head); font-weight:600; font-size:16px; color:#fffdf3; line-height:1.2; }
    .brand .name small { font-size:12px; color: var(--c-sprout); line-height:1.3; }
    .brand .close { margin-left:auto; border:none; background:transparent; font-size:26px; line-height:1; cursor:pointer; color:#f4f1e3; }
    @media (min-width: 768px) { .brand .close { display:none; } }

    .section-label {
      margin: 22px 26px 8px;
      font-family: var(--f-head);
      font-size: 12px; font-weight: 600;
      letter-spacing: .12em; text-transform: uppercase;
      color: rgba(244, 241, 227, .6);
    }

    .nav { display:flex; flex-direction:column; padding: 0 12px; }
    .nav a {
      position: relative;
      display:flex; align-items:center; gap:14px;
      min-height: 52px; box-sizing: border-box;
      padding: 8px 14px; margin: 3px 0;
      font-family: var(--f-head); font-size: 16px; font-weight: 500;
      color: #f4f1e3; text-decoration:none;
      border-radius: 14px;
      transition: background var(--t-quick) ease, color var(--t-quick) ease, transform var(--t-quick) ease;
    }
    .nav a:hover { background: rgba(255,255,255,.09); transform: translateX(2px); }
    .nav .icon {
      width: 36px; height: 36px; flex: none;
      display:grid; place-items:center;
      border-radius: 10px;
      background: rgba(255,255,255,.08);
      color: var(--c-sprout);
      transition: background var(--t-quick) ease, color var(--t-quick) ease;
    }
    .nav .icon .bi { width: 20px; height: 20px; }
    .nav a.active {
      background: var(--c-paper);
      color: var(--c-forest);
      font-weight: 600;
      box-shadow: 0 6px 16px rgba(0,0,0,.22);
    }
    .nav a.active::before {
      content: "";
      position: absolute; left: -12px; top: 10px; bottom: 10px;
      width: 5px; border-radius: 0 4px 4px 0;
      background: var(--c-sun);
    }
    .nav a.active .icon { background: var(--g-leaf); color: #fff; }
    .nav a.disabled { pointer-events:none; opacity:.42; }
    .mission-link, .certificate-link { position: relative; }

    /* A row of trees at the foot of the panel, gently swaying. */
    .sidebar-forest {
      margin-top: auto;
      height: 120px;
      width: 100%;
      flex: none;
      display: block;
      fill: rgba(143, 209, 122, .16);
    }
    .sidebar-forest .t {
      transform-box: fill-box; transform-origin: 50% 100%;
      animation: forest-sway 7s ease-in-out infinite;
    }
    .sidebar-forest .t:nth-child(2) { animation-duration: 9s; animation-delay: -2s; fill: rgba(143, 209, 122, .24); }
    .sidebar-forest .t:nth-child(3) { animation-duration: 8s; animation-delay: -4s; }
    .sidebar-forest .t:nth-child(4) { animation-duration: 10s; animation-delay: -1s; fill: rgba(143, 209, 122, .22); }

    /* ---- mobile bottom nav: floating canopy bar ------------------------ */
    .bottom-nav {
      position: fixed;
      left: 8px;
      right: 8px;
      bottom: calc(8px + env(safe-area-inset-bottom));
      height: 70px;
      padding: 6px 8px;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 4px;
      align-items: center;
      background: var(--g-canopy);
      border: 1px solid rgba(232, 179, 60, .4);
      border-radius: 22px;
      box-shadow: 0 10px 30px rgba(10, 31, 20, .35);
      z-index: 2500;
    }
    .bottom-separator { display: none; }
    .bottom-nav a {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 58px;
      text-decoration: none;
      color: rgba(244, 241, 227, .8);
      border-radius: 16px;
      transition: color var(--t-quick) ease;
      min-width: 0;
    }
    .icon-wrap {
      width: 46px;
      height: 30px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background var(--t-base) var(--ease-settle), transform var(--t-base) var(--ease-settle);
    }
    .bi {
      width: 22px;
      height: 22px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bottom-nav a .label {
      margin-top: 3px;
      font-family: var(--f-head);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .bottom-nav a.active { color: #fffdf3; }
    .bottom-nav a.active .label { font-weight: 600; color: var(--c-sunlight); }
    .bottom-nav a.active .icon-wrap { background: var(--g-sun); color: #0f3d24; transform: translateY(-2px); }
    .bottom-nav a.disabled { pointer-events:none; opacity:.4; }
    .mission-item, .certificate-item { position: relative; }

    .bottom-nav .alert-badge {
      top: 0;
      right: calc(50% - 28px);
      width: 18px;
      height: 18px;
      font-size: 11px;
    }

    @media (min-width: 768px) { .bottom-nav { display:none; } }

    .alert-badge {
      position: absolute;
      top: 8px;
      right: 12px;
      background: var(--c-danger);
      color: white;
      font-weight: 800;
      font-size: 13px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid #0f3d24;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pulse-alert 1.6s ease-in-out infinite;
    }
    @keyframes pulse-alert {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.12); }
    }
    .certificate-badge { background: var(--c-sun); color: #0f3d24; }

    .overlay { position:fixed; inset:0; background:rgba(10,31,20,.5); z-index: 2900; }
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
  private zone = inject(NgZone);

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

  isTh(): boolean {
    return this.languageService.currentLanguage().code === 'th';
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

      const missions = this.storage.getMissionsSnapshot() as any[];
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
      // Poll once a second to catch mission completion — outside Angular's zone, so the timer
      // no longer triggers a whole-app change detection every second; this menu is redrawn
      // only when one of its three flags actually changed.
      this.zone.runOutsideAngular(() => {
        this.refreshInterval = setInterval(() => {
          const before = `${this.isMissionsEnabled}|${this.isCertificateEnabled}|${this.certificateOnly}`;
          this.refreshState();
          if (before !== `${this.isMissionsEnabled}|${this.isCertificateEnabled}|${this.certificateOnly}`) {
            this.zone.run(() => this.cdr.detectChanges());
          }
        }, 1000);
      });
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
      const missions = this.storage.getMissionsSnapshot() as any[];
      this.isCertificateEnabled = Array.isArray(missions) && missions.length > 0 && missions.every((m: any) => m.reached);
    } catch {
      this.isMissionsEnabled = false;
      this.isCertificateEnabled = false;
      this.certificateOnly = false;
    }
  }
}
