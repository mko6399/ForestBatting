import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { HELP, HelpEntry, Lang, Text } from '../../config/device-help';
import { DeviceCheckService } from '../../services/device-check.service';
import { LanguageService } from '../../services/language.service';

/**
 * The one popup that explains any device / permission problem: what happened, why, and the
 * exact taps to fix it on *this* kind of phone. Opened through DeviceCheckService.show().
 */
@Component({
  selector: 'app-device-help-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry(); as e) {
      <div class="scrim" (click)="close()"></div>
      <section class="sheet" role="dialog" aria-modal="true" [attr.aria-labelledby]="'help-title'"
               [attr.data-severity]="e.severity">
        <div class="grab" aria-hidden="true"></div>
        <header>
          <span class="icon" aria-hidden="true">{{ e.icon }}</span>
          <h2 id="help-title">{{ tx(e.title) }}</h2>
        </header>

        <p class="cause"><strong>{{ th() ? 'สาเหตุ' : 'Why' }}:</strong> {{ tx(e.cause) }}</p>

        <h3>{{ th() ? 'วิธีแก้' : 'How to fix' }}
          <small>· {{ platformLabel() }}</small></h3>
        <ol class="steps">
          @for (s of steps(e); track $index) {
            <li>{{ tx(s) }}</li>
          }
        </ol>

        @if (copied()) {
          <p class="copied" role="status">{{ th() ? 'คัดลอกลิงก์แล้ว — วางในช่องที่อยู่ของ Safari/Chrome' : 'Link copied — paste it into Safari/Chrome' }}</p>
        }

        <div class="actions">
          @if (e.action && showAction(e)) {
            <button type="button" class="primary" (click)="act(e)">{{ tx(e.action.label) }}</button>
          }
          @if (open() === 'in-app-browser') {
            <button type="button" class="secondary" (click)="copyLink()">{{ th() ? 'คัดลอกลิงก์' : 'Copy link' }}</button>
          }
          <button type="button" class="ghost" (click)="close()">{{ th() ? 'ปิด' : 'Close' }}</button>
        </div>

        <button type="button" class="check-link" (click)="openCheck()">
          {{ th() ? 'ตรวจความพร้อมของเครื่องทั้งหมด →' : 'Run the full device check →' }}
        </button>
      </section>
    }
  `,
  styles: [`
    .scrim {
      position: fixed; inset: 0; z-index: 12000;
      background: rgba(10, 31, 20, .6);
      animation: forest-fade var(--t-base) var(--ease-settle) both;
    }
    .sheet {
      position: fixed; z-index: 12001;
      left: 0; right: 0; bottom: 0;
      max-height: 88dvh; overflow-y: auto;
      box-sizing: border-box;
      padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
      background: var(--c-paper);
      border-radius: 24px 24px 0 0;
      border-top: 6px solid var(--c-moss);
      box-shadow: var(--shadow-float);
      animation: forest-rise var(--t-slow) var(--ease-settle) both;
    }
    .sheet[data-severity="blocker"] { border-top-color: var(--c-danger); }
    .sheet[data-severity="warn"] { border-top-color: var(--c-sun); }
    @media (min-width: 640px) {
      .sheet { left: 50%; right: auto; bottom: 50%; width: 520px; transform: translate(-50%, 50%);
               border-radius: 24px; animation: forest-fade var(--t-base) var(--ease-settle) both; }
      .grab { display: none; }
    }
    .grab { width: 44px; height: 5px; border-radius: 99px; background: var(--c-line); margin: 0 auto 12px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .icon {
      flex: none; width: 52px; height: 52px; display: grid; place-items: center;
      border-radius: 16px; background: var(--c-morning); font-size: 26px;
    }
    h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--c-forest); }
    .cause { margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: var(--c-stone); }
    .cause strong { color: var(--c-ink); }
    h3 { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: var(--c-ink); }
    h3 small { font-weight: 500; color: var(--c-pebble); font-size: 13px; }
    .steps { margin: 0 0 16px; padding: 0; list-style: none; counter-reset: s; display: grid; gap: 8px; }
    .steps li {
      counter-increment: s; position: relative;
      padding: 10px 12px 10px 46px; border-radius: 12px;
      background: var(--c-mist); border: 1px solid var(--c-line);
      font-size: 15px; line-height: 1.55; color: var(--c-ink);
    }
    .steps li::before {
      content: counter(s); position: absolute; left: 10px; top: 9px;
      width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: var(--c-moss); color: #fff; font: 600 14px/1 var(--f-head);
    }
    .copied { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; background: var(--c-morning); color: var(--c-forest); font-weight: 600; font-size: 14px; }
    .actions { display: grid; gap: 8px; }
    .actions button {
      min-height: 50px; border-radius: 999px; font: 600 16px/1.2 var(--f-head); cursor: pointer;
    }
    .primary { border: 0; background: var(--g-leaf); color: #fff; box-shadow: 0 8px 20px rgba(31, 107, 58, .3); }
    .secondary { border: 2px solid var(--c-moss); background: transparent; color: var(--c-forest); }
    .ghost { border: 0; background: transparent; color: var(--c-stone); }
    .check-link {
      display: block; margin: 8px auto 0; border: 0; background: none; cursor: pointer;
      color: var(--c-moss); font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px;
    }
  `],
})
export class DeviceHelpSheetComponent {
  private readonly device = inject(DeviceCheckService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly open = this.device.openIssue;
  readonly entry = computed(() => {
    const id = this.open();
    return id ? HELP[id] : null;
  });
  readonly th = computed(() => this.language.currentLanguage().code === 'th');
  readonly copied = signal(false);

  tx(text: Text): string {
    return text[(this.th() ? 'th' : 'en') as Lang];
  }

  steps(e: HelpEntry): Text[] {
    return e.steps[this.device.env.platform] ?? e.steps.other;
  }

  platformLabel(): string {
    const p = this.device.env.platform;
    if (p === 'ios') return 'iPhone / iPad';
    if (p === 'android') return 'Android';
    return this.th() ? 'อุปกรณ์นี้' : 'this device';
  }

  showAction(e: HelpEntry): boolean {
    if (e.action?.kind === 'install') return this.device.canInstall();
    return true;
  }

  act(e: HelpEntry): void {
    switch (e.action?.kind) {
      case 'retry-location':
        this.close();
        this.device.retryLocation?.();
        break;
      case 'open-external':
        this.device.openExternal();
        break;
      case 'install':
        void this.device.install().then(() => this.close());
        break;
      case 'reload':
        location.reload();
        break;
      case 'open-check':
        this.openCheck();
        break;
      default:
        this.close();
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.copied.set(true);
    } catch {
      window.prompt(this.th() ? 'คัดลอกลิงก์นี้' : 'Copy this link', location.href);
    }
  }

  openCheck(): void {
    this.close();
    void this.router.navigate(['/check']);
  }

  close(): void {
    this.copied.set(false);
    this.device.close();
  }
}
