import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HelpIssueId } from '../../config/device-help';
import { CheckResult, CheckState, DeviceCheckService } from '../../services/device-check.service';
import { LanguageService } from '../../services/language.service';
import { PerformanceModeService } from '../../services/performance-mode.service';

const LABELS: Record<string, { th: string; en: string }> = {
  browser: { th: 'เบราว์เซอร์', en: 'Browser' },
  secure: { th: 'การเชื่อมต่อปลอดภัย (https)', en: 'Secure connection (https)' },
  'geo-support': { th: 'รองรับ GPS', en: 'GPS supported' },
  location: { th: 'ตำแหน่ง GPS (ทดสอบจริง)', en: 'GPS position (live test)' },
  storage: { th: 'บันทึกความคืบหน้าในเครื่อง', en: 'Saving progress on this phone' },
  persist: { th: 'กันข้อมูลถูกลบอัตโนมัติ', en: 'Protected from automatic clean-up' },
  wakelock: { th: 'กันจอดับระหว่างเดิน', en: 'Keep screen awake while walking' },
  online: { th: 'อินเทอร์เน็ต', en: 'Internet' },
  notify: { th: 'การแจ้งเตือน', en: 'Notifications' },
};

/**
 * "Is this phone ready for the trail?" — one page that runs every check, explains each
 * failure through the shared help sheet, and tests GPS from a tap (which is also the most
 * reliable moment to raise the permission prompt on iOS).
 *
 * Meant for visitors before they set off, and for staff at the entrance: the summary line
 * at the bottom is what to read out or screenshot when asking for help.
 */
@Component({
  selector: 'app-device-check',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="check">
      <header class="head u-rise">
        <span class="badge" aria-hidden="true">🩺</span>
        <div>
          <h1>{{ th() ? 'ตรวจความพร้อมของเครื่อง' : 'Device readiness check' }}</h1>
          <p>{{ th() ? 'ใช้เวลาไม่ถึง 1 นาที ทำก่อนเริ่มเดินเพื่อไม่ติดปัญหากลางทาง' : 'Under a minute. Do it before you set off so nothing stops you halfway.' }}</p>
        </div>
      </header>

      <ul class="list u-rise" style="animation-delay:100ms">
        @for (r of rows(); track r.id) {
          <li [attr.data-state]="r.state">
            <span class="dot" aria-hidden="true">{{ mark(r.state) }}</span>
            <span class="label">
              {{ label(r.id) }}
              @if (r.detail) { <small>{{ r.detail }}</small> }
            </span>
            @if (r.help && r.state !== 'ok') {
              <button type="button" class="fix" (click)="help(r.help)">{{ th() ? 'วิธีแก้' : 'Fix' }}</button>
            }
          </li>
        }
      </ul>

      <button type="button" class="gps u-rise" style="animation-delay:180ms" (click)="testGps()" [disabled]="gpsRunning()">
        {{ gpsRunning()
          ? (th() ? 'กำลังหาตำแหน่ง… (สูงสุด 20 วินาที)' : 'Finding your position… (up to 20 s)')
          : (th() ? '📍 ทดสอบ GPS ตอนนี้' : '📍 Test GPS now') }}
      </button>
      <p class="note">{{ th()
        ? 'ถ้ามีหน้าต่างถามสิทธิ์ตำแหน่ง ให้กด "อนุญาต"'
        : 'If you are asked for your location, tap "Allow".' }}</p>

      <section class="card install u-rise" style="animation-delay:240ms">
        <h2>{{ th() ? 'ติดตั้งเป็นแอป (ไม่บังคับ)' : 'Install as an app (optional)' }}</h2>
        @if (device.env.standalone) {
          <p>✅ {{ th() ? 'กำลังใช้งานแบบแอปอยู่แล้ว' : 'Already running as an app.' }}</p>
        } @else if (device.env.platform === 'ios') {
          <p>{{ th()
            ? 'ใช้ใน Safari ได้ทันทีโดยไม่ต้องติดตั้ง ถ้าต้องการติดตั้ง ให้ทำก่อนเริ่มเดิน เพราะแอปบน iPhone เก็บข้อมูลแยกจาก Safari'
            : 'Works straight away in Safari. If you want to install, do it before you start — on iPhone the app keeps separate data from Safari.' }}</p>
          <button type="button" class="secondary" (click)="help('install-ios')">{{ th() ? 'ดูวิธีเพิ่มไปยังหน้าจอโฮม' : 'How to add to Home Screen' }}</button>
        } @else if (device.canInstall()) {
          <p>{{ th() ? 'ติดตั้งได้ในแตะเดียว เปิดเร็วขึ้นและใช้ได้แม้สัญญาณอ่อน' : 'One tap to install; opens faster and copes better with weak signal.' }}</p>
          <button type="button" class="primary" (click)="install()">{{ th() ? '⬇️ ติดตั้งแอป' : '⬇️ Install app' }}</button>
        } @else {
          <p>{{ th() ? 'ใช้ในเบราว์เซอร์ได้เลย หรือติดตั้งจากเมนูของเบราว์เซอร์' : 'Use it in the browser, or install from the browser menu.' }}</p>
          <button type="button" class="secondary" (click)="help('install-android')">{{ th() ? 'ดูวิธีติดตั้ง' : 'How to install' }}</button>
        }
      </section>

      <section class="card u-rise" style="animation-delay:300ms">
        <h2>{{ th() ? 'โหมดประหยัด (เครื่องช้า / เน็ตช้า)' : 'Lite mode (slow phone / slow network)' }}</h2>
        <p>{{ th()
          ? 'ยังเห็นป่าและตัวละครครบ แต่หยุดต้นไม้โยก ใบไม้ร่วง และเอฟเฟกต์เล็ก ๆ เพื่อให้ลื่นและประหยัดแบต'
          : 'The forest and the explorer stay on screen; swaying trees, falling leaves and small effects stop, so it runs smoother and saves battery.' }}</p>
        @if (perf.reason() && perf.reason() !== 'user') {
          <p class="auto-note">{{ th() ? 'เปิดให้อัตโนมัติ: ' : 'Switched on automatically: ' }}{{ reasonLabel() }}</p>
        }
        <button type="button" class="toggle" role="switch" [attr.aria-checked]="perf.lite()" (click)="perf.setLite(!perf.lite())">
          <span class="knob" aria-hidden="true"></span>
          {{ perf.lite() ? (th() ? 'เปิดอยู่' : 'On') : (th() ? 'ปิดอยู่' : 'Off') }}
        </button>
      </section>

      <p class="summary">
        <span>{{ th() ? 'รหัสสำหรับแจ้งเจ้าหน้าที่' : 'Code for staff' }}:</span>
        <code>{{ summary() }}</code>
      </p>

      <a class="back" routerLink="/">{{ th() ? '← กลับ' : '← Back' }}</a>
    </section>
  `,
  styles: [`
    .check { max-width: 640px; margin: 0 auto; padding: 16px 14px 24px; display: grid; gap: 14px; }
    .head {
      display: flex; gap: 14px; align-items: center; padding: 18px; border-radius: var(--r-lg);
      color: #fffdf3; background: var(--g-canopy); box-shadow: var(--shadow-lift);
    }
    .badge { flex: none; width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: var(--g-sun); font-size: 26px; }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; color: #fffdf3; }
    .head p { margin: 0; font-size: 14px; line-height: 1.5; color: rgba(244, 241, 227, .88); }
    .list { list-style: none; margin: 0; padding: 6px; border-radius: var(--r-lg); background: var(--c-paper); border: 1px solid var(--c-line); box-shadow: var(--shadow-rest); }
    .list li { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 10px; border-radius: 12px; }
    .list li + li { border-top: 1px solid var(--c-line); }
    .dot { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; font-weight: 700; color: #fff; background: var(--c-pebble); }
    li[data-state="ok"] .dot { background: var(--c-moss); }
    li[data-state="warn"] .dot { background: var(--c-sun); color: #3d2a00; }
    li[data-state="fail"] .dot { background: var(--c-danger); }
    .label { flex: 1; font-size: 15px; font-weight: 500; color: var(--c-ink); line-height: 1.35; }
    .label small { display: block; font-size: 12px; font-weight: 400; color: var(--c-pebble); }
    .fix { flex: none; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 2px solid var(--c-moss); background: transparent; color: var(--c-forest); font: 600 14px/1 var(--f-head); cursor: pointer; }
    .gps, .primary { min-height: 56px; border: 0; border-radius: 999px; background: var(--g-leaf); color: #fff; font: 600 17px/1.2 var(--f-head); cursor: pointer; box-shadow: 0 8px 20px rgba(31, 107, 58, .3); }
    .gps:disabled { opacity: .7; cursor: progress; }
    .note { margin: -6px 0 0; text-align: center; font-size: 13px; color: var(--c-stone); }
    .card { padding: 18px; border-radius: var(--r-lg); background: var(--c-paper); border: 1px solid var(--c-line); box-shadow: var(--shadow-rest); display: grid; gap: 10px; }
    .card h2 { margin: 0; font-size: 17px; font-weight: 600; color: var(--c-forest); }
    .card p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--c-stone); }
    .secondary { min-height: 48px; border-radius: 999px; border: 2px solid var(--c-moss); background: transparent; color: var(--c-forest); font: 600 15px/1.2 var(--f-head); cursor: pointer; }
    .summary { margin: 0; padding: 10px 12px; border-radius: 12px; background: rgba(255, 253, 247, .9); border: 1px dashed var(--c-line); font-size: 12px; color: var(--c-stone); word-break: break-all; }
    .summary code { display: block; margin-top: 4px; font-size: 12px; color: var(--c-ink); }
    .back { justify-self: center; color: var(--c-moss); font-weight: 600; }
    .auto-note { font-size: 13px !important; color: var(--c-forest) !important; font-weight: 600; }
    .toggle { justify-self: start; display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 16px 6px 6px; border-radius: 999px; border: 2px solid var(--c-line); background: var(--c-mist); color: var(--c-ink); font: 600 15px/1 var(--f-head); cursor: pointer; }
    .toggle .knob { width: 44px; height: 26px; border-radius: 999px; background: var(--c-line); position: relative; transition: background var(--t-quick); }
    .toggle .knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform var(--t-quick) var(--ease-settle); }
    .toggle[aria-checked="true"] .knob { background: var(--c-moss); }
    .toggle[aria-checked="true"] .knob::after { transform: translateX(18px); }
  `],
})
export class DeviceCheckComponent {
  readonly device = inject(DeviceCheckService);
  readonly perf = inject(PerformanceModeService);

  reasonLabel(): string {
    const th = this.th();
    switch (this.perf.reason()) {
      case 'data-saver': return th ? 'เครื่องเปิดโหมดประหยัดเน็ต' : 'Data Saver is on';
      case 'slow-network': return th ? 'เน็ตช้า (2G)' : 'slow network (2G)';
      case 'low-memory': return th ? 'หน่วยความจำเครื่องน้อย' : 'low device memory';
      case 'slow-frames': return th ? 'เครื่องแสดงภาพไม่ทัน' : 'this phone could not keep up with the animation';
      default: return '';
    }
  }
  private readonly language = inject(LanguageService);

  readonly th = computed(() => this.language.currentLanguage().code === 'th');
  private readonly results = signal<CheckResult[]>([]);
  private readonly gps = signal<CheckResult>({ id: 'location', state: 'unknown' });
  readonly gpsRunning = computed(() => this.gps().state === 'running');

  readonly rows = computed(() => {
    const r = this.results();
    // GPS test sits right after "GPS supported".
    const i = r.findIndex(x => x.id === 'geo-support');
    return i < 0 ? [...r, this.gps()] : [...r.slice(0, i + 1), this.gps(), ...r.slice(i + 1)];
  });

  readonly summary = computed(() => {
    const e = this.device.env;
    const code = this.rows().map(r => `${r.id}:${r.state[0]}`).join(',');
    return `${e.platform}${e.iosVersion ?? ''}/${e.browser}${e.inApp ? '/inapp-' + e.inApp : ''}${e.standalone ? '/app' : ''} · ${code}`;
  });

  constructor() {
    void this.device.quickChecks().then(r => this.results.set(r));

    // testGps() points the help sheet's "Try again" at itself; hand it back to tracking on leave.
    const previousRetry = this.device.retryLocation;
    inject(DestroyRef).onDestroy(() => { this.device.retryLocation = previousRetry; });
  }

  label(id: string): string {
    const l = LABELS[id];
    return l ? (this.th() ? l.th : l.en) : id;
  }

  mark(s: CheckState): string {
    return s === 'ok' ? '✓' : s === 'fail' ? '✕' : s === 'warn' ? '!' : s === 'running' ? '…' : '?';
  }

  help(id: HelpIssueId): void {
    this.device.show(id);
  }

  async testGps(): Promise<void> {
    this.gps.set({ id: 'location', state: 'running' });
    // The sheet's "Try again" should rerun this test, not start a walk.
    this.device.retryLocation = () => void this.testGps();
    const r = await this.device.testLocation();
    if (r.ok) {
      const approximate = r.accuracy >= 1500;
      this.gps.set({
        id: 'location',
        state: approximate ? 'warn' : 'ok',
        detail: (this.th() ? 'แม่นยำ ±' : 'accuracy ±') + r.accuracy + ' m',
        help: approximate ? 'geo-approximate' : undefined,
      });
      if (approximate) this.device.show('geo-approximate');
    } else {
      const help: HelpIssueId = r.code === 1 ? 'geo-denied'
        : r.code === 2 ? 'geo-unavailable'
        : r.code === 3 ? 'geo-timeout' : 'geo-unsupported';
      this.gps.set({ id: 'location', state: r.code === 3 ? 'warn' : 'fail', help });
      this.device.show(help);
    }
  }

  async install(): Promise<void> {
    await this.device.install();
  }
}
