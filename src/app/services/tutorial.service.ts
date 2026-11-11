import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageService } from './storage.service';

export interface TutorialPageConfig {
  titleKey: string;
  messageKey: string;
}

export interface CheckpointTutorialConfig {
  checkpointId: number;
  pages: TutorialPageConfig[];
}

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private platformId = inject(PLATFORM_ID);
  private storage = inject(StorageService);

  private readonly introKey = 'tutorial_intro_seen';
  private readonly missionTypeKey = 'tutorial_seen_mission_types';
  private readonly checkpointTutorialSeenKey = 'tutorial_seen_checkpoint_ids';

  private readonly checkpointTutorialConfigs: CheckpointTutorialConfig[] = [
    {
      checkpointId: 1,
      pages: [
        { titleKey: 'checkpoint1TutorialTitle', messageKey: 'checkpoint1TutorialMessage' }
      ]
    },
    {
      checkpointId: 2,
      pages: [
        { titleKey: 'checkpoint2TutorialTitlePage1', messageKey: 'checkpoint2TutorialMessagePage1' },
        { titleKey: 'checkpoint2TutorialTitlePage2', messageKey: 'checkpoint2TutorialMessagePage2' }
      ]
    },
    {
      checkpointId: 9,
      pages: [
        { titleKey: 'checkpoint9TutorialTitle', messageKey: 'checkpoint9TutorialMessage' }
      ]
    }
  ];

  shouldPromptForIntro(): boolean {
    if (!this.isBrowser()) return false;
    return this.storage.getItem(this.introKey) !== 'true';
  }

  markIntroChoice(wantsTutorial: boolean): void {
    if (!this.isBrowser()) return;
    this.storage.setItem(this.introKey, 'true');
    this.storage.setItem('tutorial_enabled', wantsTutorial ? 'true' : 'false');
  }

  shouldShowMissionTypeTutorial(type?: string): boolean {
    if (!this.isBrowser() || !type) return false;
    if (!this.isTutorialEnabled()) return false;

    const seen = this.storage.getObject<string[]>(this.missionTypeKey) || [];
    return !seen.includes(type);
  }

  markMissionTypeTutorialSeen(type?: string): void {
    if (!this.isBrowser() || !type) return;
    const seen = this.storage.getObject<string[]>(this.missionTypeKey) || [];
    if (seen.includes(type)) return;

    seen.push(type);
    this.storage.setObject(this.missionTypeKey, seen);
  }

  getCheckpointTutorial(checkpointId: number): CheckpointTutorialConfig | undefined {
    return this.checkpointTutorialConfigs.find(c => c.checkpointId === checkpointId);
  }

  shouldShowCheckpointTutorial(checkpointId: number): boolean {
    if (!this.isBrowser()) return false;
    if (!this.isTutorialEnabled()) return false;

    const config = this.getCheckpointTutorial(checkpointId);
    if (!config) return false;

    const seenIds = this.getCheckpointTutorialSeenIds();
    return !seenIds.includes(checkpointId);
  }

  markCheckpointTutorialSeen(checkpointId: number): void {
    if (!this.isBrowser()) return;
    const seenIds = this.getCheckpointTutorialSeenIds();
    if (seenIds.includes(checkpointId)) return;

    seenIds.push(checkpointId);
    this.storage.setObject(this.checkpointTutorialSeenKey, seenIds);
  }

  private getCheckpointTutorialSeenIds(): number[] {
    const stored = this.storage.getObject<number[]>(this.checkpointTutorialSeenKey);
    return Array.isArray(stored) ? stored : [];
  }

  private isTutorialEnabled(): boolean {
    const enabled = this.storage.getItem('tutorial_enabled');
    return enabled === 'true' || enabled === null;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
