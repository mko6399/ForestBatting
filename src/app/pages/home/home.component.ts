import { Component, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { BaseDataService, Checkpoint } from '../../services/base-data.service';
import { CertificateStatsStorage, StorageService } from '../../services/storage.service';
import { LocationTrackingService } from '../../services/location-tracking.service';
import { TutorialService } from '../../services/tutorial.service';
import { EmailService } from '../../services/email.service';
import { CertificatePdfService } from '../../services/certificate-pdf.service';
import { VisitorService } from '../../services/visitor.service';
import { DeviceCheckService } from '../../services/device-check.service';
import { ConsentService } from '../../services/consent.service';

const POSTER_PREVIEW_TH = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkABQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDcSaGO0LREGUDG7bnH1HenJfvOn7qRxHypeOHBBPvT7SGONNqSKFMWcYBNOCL5cKvOm4g7DgfN68VlZkR2HC/iiUKJc8ckx55opYzabcOu5l4JIx+lFJ2E9CC1WTyopEhWRWi4YAH8KlLtG0DNbhQQeigBfbFVosRRxqNyFUxtUDkYzTf7RgAQjzmK8EMFG4e9W5czuNLQtwLLOhYW6dcfMozRVELNeEyW/mFAdozx/nrRUuxk277GjexRW8KtHEm4rjcRkjj1qKCytdiZt0OWxyKKKImj3JHVLWRo4EVEznAFFFFZtu5Dep//2Q==';
const POSTER_PREVIEW_EN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkABQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDcWWFLJmibMwGNy8FT78VDbXd4wDR3DyIHxyuV+h4FWrW3hjACOoBiz0BP86eFXyoleZdzA7CFHzepxWNmRHYd9vijAVZM9+Y80UiNZgFZELMDgnbRSdhO5FarJ5cUkcSyK0XDAA/hUm943gZrdQpB6KBs9qrRYiSNRuQrH0AGCMZpv9o24CEecxXqGCgN9a0cuZ3GloXIFlnQuLdOpHzKAaKohZbzMlv5hQHHp/nrRUuzMm3fY07qCGCFWSJNxXG4jJHHrUcFhabFzAhycHNFFETR7kjxpau0cCBEznAHeiiis23chvU//9k=';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  private languageService = inject(LanguageService);
  private baseDataService = inject(BaseDataService);
  private storage = inject(StorageService);
  private locationTracking = inject(LocationTrackingService);
  private tutorialService = inject(TutorialService);
  private emailService = inject(EmailService);
  private certificatePdf = inject(CertificatePdfService);
  private visitorService = inject(VisitorService);
  private device = inject(DeviceCheckService);
  private consent = inject(ConsentService);

  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);

  /** The visitor has not answered the storage question yet; Start answers it for them. */
  needsConsent = computed(() => this.consent.needsStorageDecision());
  private router = inject(Router);

  isLoading = signal(true);
  loadError = signal<string | null>(null);
  showTutorialPrompt = signal(false);
  showPostUseEvaluation = signal(false);
  emailStatus = signal<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  testEmailStatus = signal<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  visitorCount = signal<number | null>(null);
  private stopAfterEvaluation = false;
  private refreshInterval: any;

  private missions = signal<any[]>([]);

  private checkpointsSignal = this.baseDataService.getCheckpointsDataSignal();

  checkpoints = computed(() => {
    const checkpoints = this.checkpointsSignal();
    const missions = this.missions();
    const byId = new Map<number, any>();
    for (const mission of missions) {
      if (mission && typeof mission.id === 'number') {
        byId.set(mission.id, mission);
      }
    }

    return checkpoints
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(cp => {
        const saved = byId.get(cp.id);
        return {
          ...cp,
          reached: typeof saved?.reached === 'boolean' ? saved.reached : cp.reached,
          starEarned: typeof saved?.starEarned === 'boolean' ? saved.starEarned : cp.starEarned
        } as Checkpoint;
      });
  });

  completedCount = computed(() => this.checkpoints().filter(c => c.reached).length);
  totalCount = computed(() => this.checkpoints().length);
  progressPercent = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.completedCount() / total) * 100) : 0;
  });

  // Approximate layout positions (percent) for checkpoints 1..17
  private readonly trailPositions: Record<number, { x: number; y: number; }> = {
    1: { x: 16, y: 12 },
    2: { x: 34, y: 18 },
    3: { x: 52, y: 18 },
    4: { x: 68, y: 22 },
    5: { x: 82, y: 30 },
    6: { x: 74, y: 40 },
    7: { x: 56, y: 44 },
    8: { x: 30, y: 38 },
    9: { x: 44, y: 50 },
    10: { x: 18, y: 56 },
    11: { x: 30, y: 64 },
    12: { x: 44, y: 68 },
    13: { x: 20, y: 74 },
    14: { x: 56, y: 74 },
    15: { x: 76, y: 80 },
    16: { x: 62, y: 88 },
    17: { x: 44, y: 90 }
  };

  private readonly trailLabelSide: Record<number, 'left' | 'right' | 'center'> = {
    1: 'right',
    2: 'left',
    3: 'right',
    4: 'left',
    5: 'left',
    6: 'left',
    7: 'right',
    8: 'left',
    9: 'right',
    10: 'right',
    11: 'right',
    12: 'left',
    13: 'right',
    14: 'left',
    15: 'left',
    16: 'left',
    17: 'center'
  };

  checkpointsForTrail = computed(() => {
    return this.checkpoints().map(cp => ({
      ...cp,
      pos: this.trailPositions[cp.id] || { x: 50, y: 50 }
      ,
      side: this.trailLabelSide[cp.id] || 'center'
    }));
  });

  isTracking = computed(() => this.locationTracking.isTracking());
  lastPoint = computed(() => this.locationTracking.lastPoint());
  trackingError = computed(() => this.locationTracking.error());

  currentLang = computed(() => this.languageService.currentLanguage().code);

  posterSrc = computed(() => {
    const lang = this.currentLang();
    // JPEG re-encodes of the original 2.4 MB PNGs: same 941×1672 size, ~270 kB each.
    return lang === 'en'
      ? '/assets/images/forest-bathing-trail-home-en-web.jpg'
      : '/assets/images/forest-bathing-trail-home-th-web.jpg';
  });

  /**
   * 20px-wide copy of the poster (~1 kB, inlined), shown blurred until the real image has
   * arrived — on a weak signal the visitor sees the trail map shape at once, not a blank box.
   */
  posterPreview = computed(() => this.currentLang() === 'en' ? POSTER_PREVIEW_EN : POSTER_PREVIEW_TH);
  posterLoaded = signal(false);

  t() {
    return this.languageService.t();
  }

  ngOnInit(): void {
    this.refreshMissions();

    // Back from signing in at the end of the walk: carry on with the stop, no second confirm.
    if (this.route.snapshot.queryParamMap.get('finish') === '1' && this.storage.getAuthToken()) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.finishWalk();
    }

    this.visitorService.getCount().subscribe({
      next: (res) => this.visitorCount.set(res.totalVisitors),
      error: () => this.visitorCount.set(null)
    });

    this.baseDataService.loadBasesData().subscribe({
      next: () => {
        this.isLoading.set(false);
        this.loadError.set(null);
      },
      error: () => {
        this.isLoading.set(false);
        this.loadError.set(this.t().home?.loadError || 'Failed to load checkpoints.');
      }
    });

    if (typeof window !== 'undefined') {
      // Outside the zone: the timer itself no longer forces a whole-app check every second.
      // `missions` is a signal fed from a cached snapshot (same array until the data really
      // changes), so the page only redraws when progress actually moved.
      this.zone.runOutsideAngular(() => {
        this.refreshInterval = setInterval(() => this.refreshMissions(), 1000);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private refreshMissions(): void {
    try {
      const missions = this.storage.getMissionsSnapshot() as any[];
      this.missions.set(Array.isArray(missions) ? missions : []);
    } catch {
      this.missions.set([]);
    }
  }

  startTracking(): void {
    if (this.isTracking()) {
      return;
    }

    // The intro dialog used to cost a tap here. Its one point (the "?" help button on each
    // mission) is now a line on the Home page, so it is simply marked as seen.
    if (this.tutorialService.shouldPromptForIntro()) {
      this.tutorialService.markIntroChoice(false);
    }

    this.beginTracking();
  }

  /** Small "don't store my data" link under Start: the walk then lives in memory only. */
  declineStorage(): void {
    this.consent.setStorageConsent('denied');
    this.storage.forgetStoredData();
  }

  openPreWalkQuestionnaire(): void {
    void this.router.navigate(['/stress-questionnaire']);
  }

  startTutorialJourney(): void {
    this.tutorialService.markIntroChoice(false);
    this.showTutorialPrompt.set(false);
    this.beginTracking();
  }

  openDeviceCheck(): void {
    void this.router.navigate(['/check']);
  }

  private beginTracking(): void {
    // Settle the cases where asking would be pointless before raising any prompt.
    if (this.device.env.inApp) {
      this.device.show('in-app-browser');
      return;
    }
    const permission = this.locationTracking.permission();
    if (permission === 'unsupported') {
      this.device.show('geo-unsupported');
      return;
    }
    if (permission === 'denied') {
      // Android reports a sticky refusal; the prompt would never appear, so go straight to the fix.
      this.device.show('geo-denied');
      return;
    }

    // One tap does it all: Start is the consent (the text beside the button says so), the
    // location prompt is raised from this same tap, and the walk begins.
    if (this.consent.needsStorageDecision()) {
      this.consent.setStorageConsent('granted');
      this.storage.flushPendingWrites();
    }
    this.consent.setLocationConsent('granted');
    void this.device.requestPersistence();

    // Start the timer the moment the user presses Start, so the certificate duration and
    // step count cover the whole walk — including the distance to the first checkpoint.
    // Guarded so an in-progress session (e.g. after a refresh) keeps its original start.
    if (!this.storage.getStartTime()) {
      this.storage.setStartTime(new Date().toISOString());
    }
    // Both prompts are raised here, from the tap itself. iOS only shows the notification
    // prompt when a user gesture is behind it, and asking too early gets a sticky refusal
    // the user can then only undo from Settings.
    this.requestNotificationPermission();
    this.locationTracking.start();
    this.router.navigate(['/map']);
  }

  /**
   * Ask for notification permission from a user gesture. iOS Safari only exposes the
   * Notification API inside an installed PWA, so on a normal iPhone tab this is a no-op and
   * checkpoints fall back to the in-app alert and vibration.
   */
  private requestNotificationPermission(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    try {
      const result = Notification.requestPermission();
      // Older Safari returns nothing and takes a callback instead of returning a promise.
      if (result && typeof result.then === 'function') void result.catch(() => undefined);
    } catch {
      // Nothing to do: notifications simply stay off.
    }
  }

  stopTracking(): void {
    const th = this.currentLang() === 'th';
    if (!confirm(th ? 'จบการเดินและรับเกียรติบัตร? ข้อมูลการเดินจะถูกล้างหลังรับเกียรติบัตร' : 'Finish the walk and get your certificate? Walk data is cleared afterwards.')) {
      return;
    }

    // Signing in happens here now, not before the walk: the certificate needs a name and an
    // email. Login sends them back with ?finish=1 and ngOnInit completes the stop from there.
    if (!this.storage.getAuthToken()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/home?finish=1' } });
      return;
    }

    this.finishWalk();
  }

  private finishWalk(): void {
    this.locationTracking.stop();
    this.stopAfterEvaluation = true;
    this.showPostUseEvaluation.set(true);
    void this.sendCertificateEmail();
  }

  /**
   * Email the certificate (as a PDF attachment), walk stats and both stress check-ins to the
   * signed-in user. Fire-and-forget: a network or render failure must never block the
   * stop/certificate flow — the PDF is optional, the email still goes out without it.
   */
  private async sendCertificateEmail(): Promise<void> {
    this.emailStatus.set('sending');
    await this.deliverCertificateEmail();
  }

  /**
   * Debug helper: send the certificate email straight from the home screen, without having
   * to start/stop a walk. Reuses the exact render + payload path as the real stop flow.
   */
  async testCertificateEmail(): Promise<void> {
    this.testEmailStatus.set('sending');
    await this.deliverCertificateEmail();
  }

  /** Shared render + send path used by both the stop flow and the test button. */
  private async deliverCertificateEmail(): Promise<void> {
    const stats = this.buildCertificateStats();
    const stressBefore = this.storage.getStressResult('before');
    const stressAfter = this.storage.getStressResult('after');
    const recipientName = this.storage.getCertificateName() || this.storage.getUsername() || '';
    const durationMinutes = this.computeDurationMinutes();

    // Render the certificate PDF off-DOM. This is the slow part, so it runs while the user
    // is reading the post-use evaluation prompt; failure leaves the PDF out of the email.
    const certificatePdfDataUrl = await this.certificatePdf.renderPdfDataUrl({
      recipientName,
      language: this.currentLang(),
      durationMinutes,
      totalSteps: stats.totalSteps,
      totalCalories: stats.totalCalories,
      totalOxygen: stats.totalOxygen,
      totalPythaside: stats.totalPythaside,
      completedDate: new Date(this.storage.getCompletedAt() ?? Date.now()).toLocaleDateString()
    }) ?? undefined;

    this.emailService.sendCertificateEmail({
      recipientName,
      language: this.currentLang(),
      startedAt: this.storage.getStartTime() ?? undefined,
      completedAt: this.storage.getCompletedAt() ?? new Date().toISOString(),
      durationMinutes,
      totalSteps: stats.totalSteps,
      totalCalories: stats.totalCalories,
      totalOxygen: stats.totalOxygen,
      totalPythaside: stats.totalPythaside,
      starsEarned: stats.starsEarned,
      completedCheckpoints: stats.completedCheckpoints,
      totalCheckpoints: stats.totalCheckpoints,
      stressBefore,
      stressAfter,
      certificatePdfDataUrl
    }).subscribe({
      next: () => {
        this.emailStatus.set('sent');
        this.testEmailStatus.set('sent');
      },
      error: (err) => {
        console.error('Certificate email failed:', err);
        this.emailStatus.set('failed');
        this.testEmailStatus.set('failed');
      }
    });
  }

  /**
   * Build the certificate stats for the email. Reuses the persisted values when the
   * certificate page already computed them; otherwise computes them here from the mission
   * data so the email still carries numbers when the user stops before opening the
   * certificate page.
   */
  private buildCertificateStats(): CertificateStatsStorage {
    const saved = this.storage.getCertificateStats();
    if (saved) {
      return saved;
    }

    const checkpoints = this.checkpoints();
    const completedCheckpoints = checkpoints.filter(c => c.reached).length;
    const stars = this.storage.getBotanyStars();
    return {
      totalCheckpoints: checkpoints.length,
      completedCheckpoints,
      totalSteps: completedCheckpoints,
      totalCalories: completedCheckpoints * 50,
      totalOxygen: completedCheckpoints * 0.5,
      totalPythaside: completedCheckpoints * 100,
      starsEarned: stars?.starsEarned ?? 0
    };
  }

  private computeDurationMinutes(): number {
    const start = this.storage.getStartTime();
    if (!start) return 0;
    const end = this.storage.getCompletedAt();
    const endMs = end ? new Date(end).getTime() : Date.now();
    return Math.max(0, Math.round((endMs - new Date(start).getTime()) / 60000));
  }

  /** Open the post-trail stress check so it can be compared with the pre-trail one. */
  openStressQuestionnaire(): void {
    this.showPostUseEvaluation.set(false);
    this.stopAfterEvaluation = false;
    void this.router.navigate(['/stress-questionnaire'], { queryParams: { phase: 'after' } });
  }

  continueAfterEvaluation(): void {
    if (!this.stopAfterEvaluation) return;

    this.stopAfterEvaluation = false;
    this.showPostUseEvaluation.set(false);

    // Pressing Continue ends the trail wrap-up: unlock the Finish button, lock the menu to
    // the certificate page, and send the user straight there — whether or not they took the
    // post-trail stress check.
    this.storage.setReadyToFinish(true);
    this.storage.setCertificateOnlyMode(true);
    this.router.navigate(['/certificate']);
  }
}
