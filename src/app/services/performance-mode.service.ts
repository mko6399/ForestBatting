import { Injectable, NgZone, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type LiteReason = 'data-saver' | 'slow-network' | 'low-memory' | 'slow-frames' | 'user' | null;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', cb: () => void) => void;
}

const SS_LITE = 'perf.lite';
/** Median frame time above this (ms) means the phone is not keeping up with the effects. */
const SLOW_FRAME_MS = 26;

/**
 * Decides whether to run the app in "lite" mode and applies it as `html.lite`.
 *
 * Lite keeps every graphic on screen — the forest, the trees, the explorer — and only drops
 * the extras that cost the most: tree sway, falling leaves, light shafts, kicked-up leaves,
 * the turning rune ring and the explorer's drop shadow. Turned on automatically when:
 *  - the visitor asked for less data (Data Saver / "Lite mode" in the browser),
 *  - the connection is 2G / slow-2G (a slow network usually means a busy, older phone too),
 *  - the device reports ≤ 2 GB of memory,
 *  - or, measured on the device itself, frames take longer than ~26 ms once the app has
 *    settled. That last check is the one that matters: it catches slow phones no
 *    user-agent rule could list.
 */
@Injectable({ providedIn: 'root' })
export class PerformanceModeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);

  private readonly _reason = signal<LiteReason>(null);
  readonly lite = computed(() => this._reason() !== null);
  readonly reason = computed(() => this._reason());

  constructor() {
    if (!this.isBrowser) return;

    const remembered = this.readSession();
    if (remembered === 'off') { /* the visitor switched lite off by hand this session */ }
    else if (remembered) this.apply(remembered);
    else this.evaluateDevice();

    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    conn?.addEventListener?.('change', () => { if (!this.lite()) this.evaluateDevice(); });

    // Measure real frame times once the first screen has settled.
    if (!this.lite()) setTimeout(() => this.sampleFrames(), 3500);
  }

  /** Let the visitor switch it on/off by hand (device check page). */
  setLite(on: boolean): void {
    this.apply(on ? 'user' : null);
    try {
      if (on) sessionStorage.setItem(SS_LITE, 'user');
      else sessionStorage.setItem(SS_LITE, 'off');
    } catch { /* private mode: applies for this page only */ }
  }

  private evaluateDevice(): void {
    const nav = navigator as Navigator & { connection?: NetworkInformationLike; deviceMemory?: number };
    const conn = nav.connection;
    if (conn?.saveData) return this.apply('data-saver');
    if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return this.apply('slow-network');
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return this.apply('low-memory');
  }

  /** ~4 s of requestAnimationFrame timings, outside Angular so it triggers no change detection. */
  private sampleFrames(): void {
    if (document.visibilityState !== 'visible') return;
    if (this.readSession() === 'off') return;

    this.zone.runOutsideAngular(() => {
      const gaps: number[] = [];
      let last = performance.now();
      const until = last + 4000;
      const tick = (t: number) => {
        gaps.push(t - last);
        last = t;
        if (t < until && document.visibilityState === 'visible') {
          requestAnimationFrame(tick);
          return;
        }
        if (gaps.length < 30) return; // tab went to background; not a fair sample
        gaps.sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)];
        if (median > SLOW_FRAME_MS) {
          this.zone.run(() => this.apply('slow-frames'));
          try { sessionStorage.setItem(SS_LITE, 'slow-frames'); } catch { /* ignore */ }
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private apply(reason: LiteReason): void {
    this._reason.set(reason);
    document.documentElement.classList.toggle('lite', reason !== null);
  }

  private readSession(): Exclude<LiteReason, null> | 'off' | null {
    try {
      return sessionStorage.getItem(SS_LITE) as Exclude<LiteReason, null> | 'off' | null;
    } catch {
      return null;
    }
  }
}
