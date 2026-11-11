import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { BaseDataService, Checkpoint } from '../../services/base-data.service';
import { CertificateStatsStorage, StorageService } from '../../services/storage.service';
import { LocationTrackingService } from '../../services/location-tracking.service';
import { TutorialService } from '../../services/tutorial.service';
import { EmailService } from '../../services/email.service';
import { CertificatePdfService } from '../../services/certificate-pdf.service';
import { VisitorService } from '../../services/visitor.service';

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
    if (lang === 'en') return '/assets/images/forest-bathing-trail-home-en.png';
    if (lang === 'th') return '/assets/images/forest-bathing-trail-home-th.png';
    return '/assets/images/forest-bathing-trail-home-th.png';
  });

  t() {
    return this.languageService.t();
  }

  ngOnInit(): void {
    this.refreshMissions();

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
      this.refreshInterval = setInterval(() => {
        this.refreshMissions();
      }, 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private refreshMissions(): void {
    try {
      const missions = this.storage.getMissions();
      this.missions.set(Array.isArray(missions) ? missions : []);
    } catch {
      this.missions.set([]);
    }
  }

  startTracking(): void {
    if (this.isTracking()) {
      return;
    }

    if (this.tutorialService.shouldPromptForIntro()) {
      this.showTutorialPrompt.set(true);
      return;
    }

    this.beginTracking();
  }

  startTutorialJourney(): void {
    this.tutorialService.markIntroChoice(false);
    this.showTutorialPrompt.set(false);
    this.beginTracking();
  }

  private beginTracking(): void {
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
    if (!confirm('Data will be reset after you get certificate.')) {
      return;
    }

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
