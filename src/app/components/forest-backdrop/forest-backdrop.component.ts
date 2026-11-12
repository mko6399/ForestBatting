import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

type TreeKind = 'pine' | 'round' | 'tall';

interface Tree {
  kind: TreeKind;
  /** Inline style placing this tree's own little SVG on the stage. */
  style: string;
  tone: string;
}

interface Leaf { left: number; size: number; dur: number; delay: number; tone: string; drift: number; }
interface Mote { left: number; bottom: number; dur: number; delay: number; }

/* The scene is drawn on a 1440×420 "stage" (same numbers as the original single SVG). */
const STAGE_W = 1440;
const STAGE_H = 420;
/** Each tree is drawn in its own viewBox, base at (0,0). */
const TREE_BOX = { x: -70, y: -220, w: 140, h: 222 };
const FERN_BOX = { x: -50, y: -95, w: 100, h: 97 };

/**
 * Living forest behind every page: morning sky, light shafts, three rows of trees swaying
 * on their own clocks, drifting mist, falling leaves and motes of light.
 *
 * Performance — the picture is unchanged from the first version, the way it is drawn is not:
 *  - Every tree / fern is its own small <svg> on an HTML stage and sways via a CSS transform
 *    on that element. The browser promotes each to a GPU layer and only *moves* it each frame.
 *    (Before, the trees were <g> groups inside one full-screen SVG; animating an SVG group
 *    makes the whole SVG repaint every frame — the single most expensive thing on screen.)
 *  - The three ridges are static SVGs: painted once, never again.
 *  - `paused` freezes everything (used while a page covers the backdrop, e.g. the map).
 *  - `html.lite` (slow phone / data saver / 2G) keeps the whole scene visible but still:
 *    no sway, no particles, no light shafts. See PerformanceModeService.
 *  - prefers-reduced-motion stops everything.
 */
@Component({
  selector: 'app-forest-backdrop',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.calm]': 'calm', '[class.paused]': 'paused' },
  template: `
    <div class="sky"></div>
    <div class="sun"></div>
    <div class="rays"><span></span><span></span><span></span><span></span><span></span></div>

    <div class="woods">
      <svg class="ridge far" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path d="M0 300 C120 250 220 270 330 240 C450 205 540 260 660 236 C790 210 880 250 1000 226 C1120 202 1240 246 1440 220 L1440 420 L0 420 Z"/>
      </svg>
      @for (t of backRow; track $index) {
        <ng-container *ngTemplateOutlet="tree; context: { $implicit: t }" />
      }
      <svg class="ridge mid" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path d="M0 340 C160 300 280 330 420 306 C560 282 660 328 820 310 C980 292 1080 330 1220 304 C1320 286 1390 300 1440 296 L1440 420 L0 420 Z"/>
      </svg>
      @for (t of midRow; track $index) {
        <ng-container *ngTemplateOutlet="tree; context: { $implicit: t }" />
      }
      <svg class="ridge near" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path d="M0 392 C200 370 360 388 560 378 C760 368 900 392 1100 380 C1260 370 1360 384 1440 378 L1440 420 L0 420 Z"/>
      </svg>
      @for (t of frontRow; track $index) {
        <ng-container *ngTemplateOutlet="tree; context: { $implicit: t }" />
      }
      @for (f of ferns; track $index) {
        <svg class="sway fern" [style]="f" viewBox="-50 -95 100 97">
          <path d="M0 0 C-6 -30 -26 -52 -48 -60 C-30 -44 -16 -26 -6 0 Z"/>
          <path d="M0 0 C2 -36 14 -64 36 -78 C24 -56 14 -30 8 0 Z"/>
          <path d="M0 0 C-2 -40 -4 -70 4 -92 C8 -68 8 -36 6 0 Z"/>
        </svg>
      }
    </div>

    <ng-template #tree let-t>
      <svg class="sway" [style]="t.style" [attr.fill]="t.tone" viewBox="-70 -220 140 222">
        @switch (t.kind) {
          @case ('pine') {
            <svg:rect x="-4" y="-22" width="8" height="24" class="trunk"/>
            <svg:polygon points="0,-150 -36,-74 36,-74"/>
            <svg:polygon points="0,-118 -46,-40 46,-40"/>
            <svg:polygon points="0,-84 -56,-14 56,-14"/>
          }
          @case ('round') {
            <svg:rect x="-5" y="-62" width="10" height="64" class="trunk"/>
            <svg:circle cx="0" cy="-112" r="40"/>
            <svg:circle cx="-30" cy="-84" r="32"/>
            <svg:circle cx="31" cy="-86" r="33"/>
            <svg:circle cx="0" cy="-74" r="30"/>
          }
          @default {
            <svg:rect x="-4" y="-176" width="8" height="178" class="trunk"/>
            <svg:ellipse cx="0" cy="-190" rx="62" ry="27"/>
            <svg:ellipse cx="-36" cy="-170" rx="38" ry="18"/>
            <svg:ellipse cx="38" cy="-172" rx="40" ry="19"/>
          }
        }
      </svg>
    </ng-template>

    <div class="mist"><span></span><span></span></div>

    <div class="leaves">
      @for (l of leaves; track $index) {
        <span class="leaf-track"
              [style.left.%]="l.left"
              [style.animation-duration.s]="l.dur"
              [style.animation-delay.s]="l.delay">
          <span class="leaf"
                [style.width.px]="l.size"
                [style.height.px]="l.size * 0.62"
                [style.background]="l.tone"
                [style.--drift]="l.drift + 'px'"
                [style.animation-duration.s]="l.dur / 4"></span>
        </span>
      }
    </div>

    <div class="motes">
      @for (m of motes; track $index) {
        <span [style.left.%]="m.left" [style.bottom.%]="m.bottom"
              [style.animation-duration.s]="m.dur" [style.animation-delay.s]="m.delay"></span>
      }
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
      contain: strict;
    }

    .sky {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(120% 70% at 80% -10%, rgba(253, 236, 170, .55), transparent 60%),
        linear-gradient(180deg, #e9f2e1 0%, #f3f2e3 38%, #e4edd8 70%, #d5e5c8 100%);
    }

    .sun {
      position: absolute;
      top: -18vmax;
      right: -14vmax;
      width: 52vmax;
      height: 52vmax;
      border-radius: 50%;
      background: radial-gradient(circle closest-side, rgba(255, 240, 180, .9), rgba(255, 228, 140, .35) 45%, transparent 72%);
      animation: breathe 14s ease-in-out infinite;
      will-change: transform;
    }

    .rays {
      position: absolute;
      top: -10vh;
      right: 4vw;
      width: 70vw;
      height: 90vh;
      transform: rotate(18deg);
      transform-origin: top right;
    }
    .rays span {
      position: absolute;
      top: 0;
      width: 9vw;
      min-width: 46px;
      height: 100%;
      background: linear-gradient(180deg, rgba(255, 244, 200, .55), rgba(255, 244, 200, 0) 85%);
      opacity: 0;
      animation: ray 11s ease-in-out infinite;
      will-change: transform, opacity;
    }
    .rays span:nth-child(1) { right: 4%;  animation-delay: 0s; }
    .rays span:nth-child(2) { right: 22%; width: 5vw; animation-delay: -3s; animation-duration: 13s; }
    .rays span:nth-child(3) { right: 38%; animation-delay: -6s; animation-duration: 15s; }
    .rays span:nth-child(4) { right: 57%; width: 4vw; animation-delay: -1.5s; animation-duration: 12s; }
    .rays span:nth-child(5) { right: 74%; width: 6vw; animation-delay: -8s; animation-duration: 16s; }

    /* The stage keeps the original 1440×420 proportions and covers the bottom of the screen
       exactly like the old preserveAspectRatio="xMidYMax slice" did. */
    .woods {
      position: absolute;
      left: 50%;
      bottom: 0;
      width: max(100%, max(46vh, 260px) * 3.4286);
      aspect-ratio: 1440 / 420;
      transform: translateX(-50%);
    }
    .woods > svg { position: absolute; overflow: visible; }
    .ridge { inset: 0; width: 100%; height: 100%; }

    .ridge.far  { fill: #c2d9b2; }
    .ridge.mid  { fill: #93bd84; }
    .ridge.near { fill: #4f8d55; }
    .trunk { fill: #6b4a2e; }

    .sway {
      transform-origin: 50% 100%;
      animation: sway 7s ease-in-out infinite alternate;
      will-change: transform;
    }
    .fern {
      fill: #2f6b3a;
      animation-name: fern;
    }

    .mist span {
      position: absolute;
      left: -50%;
      width: 200%;
      height: 16vh;
      background: radial-gradient(50% 50% at 50% 50%, rgba(255, 255, 255, .55), transparent 70%);
      animation: mist 38s linear infinite alternate;
      will-change: transform;
    }
    .mist span:nth-child(1) { bottom: 20vh; }
    .mist span:nth-child(2) { bottom: 8vh; opacity: .7; animation-duration: 52s; animation-direction: alternate-reverse; }

    .leaf-track {
      position: absolute;
      top: -6vh;
      animation: fall linear infinite;
      will-change: transform;
    }
    .leaf {
      display: block;
      border-radius: 0 80% 0 80%;
      opacity: .85;
      animation: flutter ease-in-out infinite alternate;
    }

    .motes span {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: radial-gradient(circle, #fff7c2 0%, rgba(255, 236, 140, .6) 45%, transparent 70%);
      opacity: 0;
      animation: mote 9s ease-in-out infinite;
    }

    :host(.calm) .leaves { opacity: .55; }
    :host(.calm) .rays { opacity: .6; }

    /* Covered by a page (e.g. the map): keep the picture, stop the work. */
    :host(.paused) * { animation-play-state: paused !important; }

    /* Lite mode: the whole forest stays on screen, only the motion goes. Particles are removed
       entirely so their layers are freed; trees drop their GPU layers and paint once. */
    :host-context(html.lite) .sway,
    :host-context(html.lite) .sun,
    :host-context(html.lite) .mist span { animation: none; will-change: auto; }
    :host-context(html.lite) .leaves,
    :host-context(html.lite) .motes,
    :host-context(html.lite) .rays { display: none; }

    @keyframes sway   { from { transform: rotate(-2.2deg); } to { transform: rotate(2.2deg); } }
    @keyframes fern   { from { transform: rotate(-6deg); }   to { transform: rotate(5deg); } }
    @keyframes breathe { 0%, 100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.06); opacity: 1; } }
    @keyframes ray {
      0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) skewX(-4deg); }
      45%      { opacity: .75; transform: translate3d(-12px, 0, 0) skewX(2deg); }
    }
    @keyframes mist { from { transform: translate3d(-8%, 0, 0); } to { transform: translate3d(8%, 0, 0); } }
    @keyframes fall {
      0%   { transform: translate3d(0, 0, 0); opacity: 0; }
      8%   { opacity: 1; }
      92%  { opacity: 1; }
      100% { transform: translate3d(0, 112vh, 0); opacity: 0; }
    }
    @keyframes flutter {
      from { transform: translate3d(calc(var(--drift, 30px) * -1), 0, 0) rotate(-40deg); }
      to   { transform: translate3d(var(--drift, 30px), 0, 0) rotate(60deg); }
    }
    @keyframes mote {
      0%, 100% { opacity: 0; transform: translate3d(0, 0, 0); }
      50%      { opacity: .95; transform: translate3d(14px, -40px, 0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sway, .sun, .rays span, .mist span, .leaf-track, .leaf, .motes span { animation: none !important; }
      .leaves, .motes { display: none; }
      .rays span { opacity: .4; }
    }
  `],
})
export class ForestBackdropComponent {
  /** Quieter scene for content-heavy pages. */
  @Input() calm = false;
  /** Freeze all motion while a page covers the backdrop (the map). */
  @Input() paused = false;

  readonly backRow: Tree[] = this.row(
    [60, 170, 260, 380, 470, 600, 700, 830, 920, 1040, 1150, 1260, 1370],
    300, [.55, .7], ['#b3d0a2', '#a6c795', '#bcd6ab'], 1,
  );

  readonly midRow: Tree[] = this.row(
    [20, 150, 300, 520, 760, 960, 1130, 1300, 1420],
    340, [.8, 1], ['#6fa566', '#5f985a', '#7aae6e'], 2,
  );

  /** Only at the edges, so the middle of the screen stays clear behind content. */
  readonly frontRow: Tree[] = this.row(
    [-10, 90, 1340, 1450],
    406, [1.25, 1.55], ['#2c6a3c', '#245c33', '#33753f'], 3,
  );

  readonly ferns: string[] = [40, 140, 260, 1180, 1290, 1400].map((x, i) =>
    place(x, STAGE_H, 0.9 + (i % 3) * 0.25, FERN_BOX)
    + `animation-duration:${4 + (i % 3)}s;animation-delay:${-i * 0.7}s;`);

  readonly leaves: Leaf[] = Array.from({ length: 12 }, (_, i) => ({
    left: (i * 37 + 6) % 100,
    size: 14 + (i % 4) * 4,
    dur: 16 + (i % 5) * 3.5,
    delay: -i * 2.6,
    tone: ['#5f9d4c', '#8fbf5a', '#c99a3b', '#3f7f45', '#b8743a'][i % 5],
    drift: 20 + (i % 3) * 18,
  }));

  readonly motes: Mote[] = Array.from({ length: 10 }, (_, i) => ({
    left: (i * 23 + 11) % 96,
    bottom: 10 + (i * 17) % 40,
    dur: 7 + (i % 4) * 2,
    delay: -i * 1.3,
  }));

  private row(xs: number[], y: number, [lo, hi]: [number, number], tones: string[], seed: number): Tree[] {
    const kinds: TreeKind[] = ['pine', 'round', 'tall'];
    return xs.map((x, i) => {
      const r = ((i + 1) * (seed * 7 + 3)) % 10 / 10;
      const scale = +(lo + (hi - lo) * r).toFixed(2);
      return {
        kind: kinds[(i + seed) % 3],
        style: place(x, y + Math.round(r * 10), scale, TREE_BOX)
          + `animation-duration:${(5.5 + r * 4).toFixed(1)}s;animation-delay:${-(r * 6).toFixed(1)}s;`,
        tone: tones[i % tones.length],
      };
    });
  }
}

/**
 * Position a small SVG (drawn in `box`, base at 0,0) on the 1440×420 stage at (x, y) with
 * `scale`, in percentages so it scales with the stage exactly like the old single SVG.
 */
function place(x: number, y: number, scale: number, box: { x: number; y: number; w: number; h: number }): string {
  const w = box.w * scale;
  const h = box.h * scale;
  const left = x + box.x * scale;            // box.x is negative: left edge of the drawing
  const bottom = STAGE_H - y - (box.h + box.y) * scale; // (h + y) = how far the box extends below the base
  return `left:${(left / STAGE_W * 100).toFixed(3)}%;`
    + `bottom:${(bottom / STAGE_H * 100).toFixed(3)}%;`
    + `width:${(w / STAGE_W * 100).toFixed(3)}%;`
    + `height:${(h / STAGE_H * 100).toFixed(3)}%;`;
}

