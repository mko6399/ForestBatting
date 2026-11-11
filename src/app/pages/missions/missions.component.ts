import { Component, OnInit, signal, WritableSignal, computed, inject, PLATFORM_ID, effect, Injector } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationService } from '../../services/navigation.service';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { StorageService } from '../../services/storage.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { LocationTrackingService } from '../../services/location-tracking.service';
import { BaseDataService } from '../../services/base-data.service';
import { AudioService } from '../../services/audio.service';
import { TutorialService, TutorialPageConfig } from '../../services/tutorial.service';

interface Question {
  id: string;
  question: string;
  choices: Record<string, string>;
  correctAnswer?: string;
}

interface Checkpoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  mission: string;
  reached: boolean;
  photo?: string;
  answer?: string;
  shareLink?: string;
  question?: Question | string;
  type?: 'question_forest_bathing' | 'activity_forest_bathing' | 'activity_forest_bathing_photo' | 'question_botany' | 'writing_reflection';
  randomizeActivities?: boolean;
  readMore?: string;
  questions?: Question[];
  activities?: string[];
  steps?: string[];
  activity?: string;
  certificate?: string[];
  starEarned?: boolean;
}

const INITIAL_CHECKPOINTS: Checkpoint[] = []; // Will be loaded from localStorage from map component

@Component({
  selector: 'app-missions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="missions-page">
      <!-- <div class="mission-selector-panel">
        <h4 class="selector-title">Test Mission</h4>
        <div class="selector-buttons">
          <button
            *ngFor="let cp of checkpoints(); trackBy: trackByCheckpointId"
            type="button"
            class="selector-btn"
            [class.active]="currentCheckpoint()?.id === cp.id"
            (click)="selectMission(cp.id)">
            {{ t.missions.checkpoint }} {{ cp.id }}
          </button>
        </div>
      </div> -->

      <!-- If a current checkpoint is active, show only that mission -->
      <ng-container *ngIf="currentCheckpoint(); else noMission">
        <article
          class="mission-card"
          [class.completed]="currentCheckpoint()!.reached"
          [style.background-image]="'url(' + getCheckpointBackgroundUrl(currentCheckpoint()!.id) + ')'">
          <header class="card-header">
            <div class="checkpoint-info">
              <span class="checkpoint-badge"> {{ t.missions.checkpoint }} {{currentCheckpoint()!.id}}</span>
              <h3 class="checkpoint-name">{{currentCheckpoint()!.name}}</h3>
            </div>
          </header>

          <!-- Help button moved out of header and positioned inside the card -->
          <button
            *ngIf="getMissionTypeTutorialForCheckpoint(currentCheckpoint())"
            type="button"
            class="help-btn"
            (click)="showMissionTypeHelp()"
            [attr.aria-label]="t.missions.missionTutorialTitle">
            ?
          </button>

          <div class="mission-content">
            <!-- YouTube Player -->
            <div *ngIf="audio.currentYouTubeId() as youtubeId" class="youtube-container">
              <iframe
                [src]="audio.getSafeYouTubeUrl(youtubeId)"
                class="youtube-player"
                frameborder="0"
                allow="autoplay; encrypted-media"
                allowfullscreen>
              </iframe>
            </div>

            <!-- Instruction / activities (e.g. checkpoint 17). Hide for question checkpoints. -->
            <!-- <div
              class="task-section"
              *ngIf="
                currentCheckpoint()?.id === 17 ||
                (
                  (currentCheckpoint()?.type !== 'question_botany' && currentCheckpoint()?.type !== 'question_forest_bathing') &&
                  (
                    (currentCheckpoint()?.activity && currentCheckpoint()!.activity!.trim().length > 0) ||
                    (currentCheckpoint()?.steps && currentCheckpoint()!.steps!.length > 0)
                  )
                )
              ">
              <h4 class="section-title">{{ t.missions.whatToDo }}</h4>
              <p class="mission-text" *ngIf="currentCheckpoint()?.activity && currentCheckpoint()!.activity!.trim().length > 0; else missionFallback">
                {{ currentCheckpoint()!.activity }}
              </p>
              <ng-template #missionFallback>
                <p class="mission-text" *ngIf="currentCheckpoint()?.id === 17">
                  {{ currentCheckpoint()!.mission }}
                </p>
              </ng-template>
              <ul class="task-list" *ngIf="currentCheckpoint()?.steps && currentCheckpoint()!.steps!.length > 0">
                <li *ngFor="let step of currentCheckpoint()!.steps">{{ step }}</li>
              </ul>
            </div> -->

            <!-- Display single random question if available -->
            <div class="question-section" *ngIf="selectedQuestion && (currentCheckpoint()?.type === 'question_botany' || currentCheckpoint()?.type === 'question_forest_bathing')">
              <div class="question-box">
                <p class="question-text">{{ selectedQuestion.question }}</p>

                <!-- Show choices as buttons -->
                <div class="choices" *ngIf="!answerFeedback">
                  <button
                    *ngFor="let key of getChoiceKeys(selectedQuestion); let i = index"
                    class="choice-btn"
                    (click)="selectedAnswerChoice = key"
                    [class.selected]="selectedAnswerChoice === key">
                    {{ formatChoiceLabel(key, i) }}: {{ selectedQuestion.choices[key] }}
                  </button>
                </div>

                <!-- Show feedback after answer -->
                <div *ngIf="answerFeedback" class="answer-feedback" [class.correct]="answerFeedback.isCorrect" [class.incorrect]="!answerFeedback.isCorrect">
                  <p class="feedback-title">
                    {{ answerFeedback.isCorrect ? t.missions.correct : t.missions.incorrect }}
                  </p>
                  <p class="feedback-message">
                    <strong>{{ t.missions.yourQuestion }}:</strong><br>
                    {{ selectedQuestion.question }}
                  </p>
                  <p class="feedback-message">
                    <strong>{{ t.missions.rightAnswer }}</strong> {{ answerFeedback.correctAnswer }}
                  </p>
                  <p class="feedback-message">{{ answerFeedback.message }}</p>
                </div>

                <!-- Save Mission button (shown when answer selected but not feedback) -->
                <!-- <button
                  *ngIf="selectedAnswerChoice && !answerFeedback"
                  class="save-btn"
                  (click)="submitQuestionAnswer()">
                  <span class="btn-icon">💾</span>
                  {{ t.missions.saveMission }}
                </button> -->

                <!-- Continue button (shown after feedback) -->

              </div>
            </div>            <!-- Display activities if available -->
            <div class="activities-section" *ngIf="activitiesToDisplay.length > 0">
              <h4 class="section-title">{{ t.missions.activities }}</h4>
              <ul class="activities-list">
                <li *ngFor="let activity of activitiesToDisplay">{{ activity }}</li>
              </ul>
            </div>

            <div class="mission-note-section" *ngIf="currentCheckpoint()?.id == 1">
              <h4 class="section-title">{{ getCheckpointOneNoteTitle() }}</h4>
              <textarea
                class="mission-note-input"
                [(ngModel)]="answer"
                [placeholder]="getCheckpointOneNotePlaceholder()"
                rows="4">
              </textarea>
            </div>

            <!-- Photo section for photo-specific activities -->
            <div class="photo-section" *ngIf="currentCheckpoint()?.type === 'activity_forest_bathing_photo'">
              <h4 class="section-title">{{ t.missions.photoEvidence }}</h4>
              <button class="photo-btn" type="button" (click)="cameraInput.click()">
                <span class="btn-icon">📸</span>
                {{ photo ? t.missions.changePhoto : t.missions.takePhoto }}
              </button>
              <p class="photo-hint" *ngIf="currentCheckpoint()?.type === 'activity_forest_bathing_photo'">
                {{ t.missions.photoSavedOnDeviceHint }}
              </p>
              <input #cameraInput type="file" accept="image/*" capture="environment" (change)="onFileSelected($event)" hidden />

              <div *ngIf="photo" class="photo-preview">
                <img [src]="photo" alt="Mission photo">
              </div>
            </div>

            <!-- ReadMore button if available -->
            <!-- <div class="read-more-section" *ngIf="currentCheckpoint()?.readMore">
              <button class="read-more-btn" (click)="openReadMore(currentCheckpoint()!.id, currentCheckpoint()!.readMore!)">
                <svg class="app-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M6.5 5.5H5a2.5 2.5 0 0 0 0 5h1.5" />
                  <path d="M9.5 5.5H11a2.5 2.5 0 0 1 0 5H9.5" />
                  <path d="M5.75 8h4.5" />
                </svg>
                <span *ngIf="currentCheckpoint()?.starEarned" class="star-earned">⭐</span>
              </button>
            </div> -->
          </div>

          <div class="card-footer">
            <button *ngIf="currentCheckpoint()?.type === 'activity_forest_bathing'" class="save-btn" (click)="saveMission()">
              {{ t.missions.saveMission }}
            </button>
            <button *ngIf="photo || (currentCheckpoint()?.id === 1 && answer.trim().length > 0)"  class="save-btn" (click)="saveMission()">
              {{ t.missions.saveMission }}
            </button>
            <button
              *ngIf="selectedAnswerChoice && !answerFeedback"
              class="save-btn"
              (click)="submitQuestionAnswer()">
              <!-- <span class="btn-icon">💾</span> -->
              {{ t.missions.saveMission }}
            </button>
            <button
              *ngIf="answerFeedback"
              class="continue-btn"
              (click)="resetAnswerFeedback()">
              {{ t.missions.continue }}
            </button>


            <!-- <div class="share-section">
              <p class="share-label">📱 Share your progress:</p>
              <div class="share-buttons">
                <button class="share-btn facebook" (click)="shareToFacebook()">
                  <span class="share-icon">📘</span>
                  Facebook
                </button>
                <button class="share-btn instagram" (click)="shareToInstagram()">
                  <span class="share-icon">📷</span>
                  Instagram
                </button>
                <button class="share-btn tiktok" (click)="shareToTikTok()">
                  <span class="share-icon">🎵</span>
                  TikTok
                </button>
              </div>
            </div> -->
          </div>
        </article>
      </ng-container>

      <ng-template #noMission>
        <ng-container *ngIf="checkpoints().length > 0; else emptyState">
          <div class="checkpoint-grid">
            <article
              class="checkpoint-tile"
              *ngFor="let cp of checkpoints(); trackBy: trackByCheckpointId"
              [class.completed]="cp.reached"
              [style.background-image]="'url(' + getCheckpointBackgroundUrl(cp.id) + ')'">
              <div class="tile-content">
                <div class="tile-header">
                  <span class="checkpoint-badge"> {{ t.missions.checkpoint }} {{ cp.id }}</span>
                </div>
                <h3 class="checkpoint-name">{{ cp.name }}</h3>
              </div>
            </article>
          </div>
        </ng-container>

        <ng-template #emptyState>
          <div class="empty-state">
            <div class="empty-icon">🗺️</div>
            <h3>{{ t.missions.noActiveMission }}</h3>
            <p>{{ t.missions.noActiveMissionDesc }}</p>
          </div>
        </ng-template>
      </ng-template>
    </section>

    <div class="mission-tutorial-overlay" *ngIf="showMissionTypeTutorial">
      <div class="mission-tutorial-card">
        <h4>{{ tutorialOverlayTitle }}</h4>
        <p>{{ missionTutorialMessage }}</p>
        <img
          class="mission-tutorial-image"
          [src]="tutorialIllustrationSrc"
          [alt]="tutorialHelperText"
        />
        <p class="mission-tutorial-helper-text">{{ tutorialHelperText }}</p>
        <div class="mission-tutorial-actions">
          <button
            type="button"
            class="mission-tutorial-btn"
            (click)="checkpointTutorialPageIndex < checkpointTutorialPages.length - 1 ? nextCheckpointTutorialPage() : closeMissionTutorial()"
          >
            {{ checkpointTutorialPageIndex < checkpointTutorialPages.length - 1 ? t.missions.next : t.missions.missionTutorialClose }}
          </button>
        </div>
      </div>
    </div>

    <!-- Completion Popup -->
    <div class="completion-popup-overlay" *ngIf="showCompletionPopup">
      <div class="completion-popup">
        <div class="confetti">🎊</div>
        <div class="success-icon">✅</div>
        <h2 class="popup-title">{{ getCompletionPopupTitle() }}</h2>
        <p class="popup-message">{{ getCompletionPopupMessage() }}</p>
        <p class="popup-message" *ngIf="currentCheckpoint()?.id === 16">
          {{ t.missions.checkpoint17RouteMessage }}
        </p>
        <div class="celebration-emoji">🎉 🌟 🎯 🏆 🎉</div>
        <button type="button" class="completion-confirm-btn" (click)="confirmCompletionPopup()">
          {{ t.common.ok }}
        </button>
      </div>
    </div>

    <!-- Upload Notification Popup -->
    <div class="upload-notification-overlay" *ngIf="uploadNotification.show" [class.success]="uploadNotification.isSuccess" [class.error]="!uploadNotification.isSuccess">
      <div class="upload-notification-popup">
        <div class="notification-icon">
          {{ uploadNotification.isSuccess ? '✅' : '❌' }}
        </div>
        <h3 class="notification-title">
          {{ uploadNotification.title || (uploadNotification.isSuccess ? 'Upload Successful' : 'Upload Failed') }}
        </h3>
        <p class="notification-message">{{ uploadNotification.message }}</p>
        <div class="notification-actions">
          <button type="button" class="notification-close-btn" (click)="closeUploadNotification()">
            {{ t.common.ok }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      min-height: calc(100dvh - 56px);
      background-image: url('/assets/checkpoint_bg/waterfall.jpg');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    :host::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.65);
      pointer-events: none;
    }

    .missions-page {
      position: relative;
      z-index: 1;
      padding: 20px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .activities-list {
      font-size: 19px;
    }

    .checkpoint-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }

    .checkpoint-tile {
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      min-height: 200px;
      background-size: cover;
      background-position: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      border: 2px solid rgba(255, 255, 255, 0.7);
    }

    .checkpoint-tile::before,
    .mission-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.18);
      pointer-events: none;
    }

    .tile-content {
      position: relative;
      z-index: 1;
      //height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 18px;
      color: white;
    }

    .tile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .mission-card {
      position: relative;
      background-color: #ffffff;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .mission-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 15px 50px rgba(0, 0, 0, 0.2);
    }

    .mission-card.completed {
      border: 3px solid #22c55e;
    }

    .card-header {
      position: relative;
      z-index: 1;
      background: transparent;
      padding: 50px 20px 20px 20px;
      color: white;
      height: 80px;
    }

    .card-header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.28);
      pointer-events: none;
    }

    .card-header > * {
      position: relative;
      z-index: 1;
    }

    .checkpoint-name {
      margin: 8px 0 0;
      font-size: 30px;
      font-weight: 700;
      color: white;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: 25px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-weight: 600;
    }

    .status-badge.completed {
      background: #22c55e;
    }

    .mission-content {
      position: relative;
      z-index: 1;
      padding: 24px;
      background: rgba(255, 255, 255, 0.92);
    }

    .section-title {
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mission-text {
      color: #475569;
      font-size: 20px;
      line-height: 1.6;
      margin: 0;
      padding: 16px;
      background: #f8fafc;
      border-radius: 12px;
      border-left: 4px solid #667eea;
    }

    .task-list {
      margin: 12px 0 0;
      padding-left: 18px;
      color: #475569;
      font-size: 20px;
      line-height: 1.6;
    }

    .mission-note-section {
      margin-top: 16px;
    }

    .mission-note-input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 12px;
      font-size: 18px;
      color: #1e293b;
      background: #ffffff;
      resize: vertical;
      min-height: 96px;
    }

    .mission-note-input:focus-visible {
      outline: 3px solid rgba(102, 126, 234, 0.25);
      outline-offset: 2px;
    }

    .question-box {
      background: linear-gradient(135deg, #e0f2fe 0%, #ddd6fe 100%);
      border: 2px solid #7c3aed;
      border-radius: 16px;
      padding: 16px;
      position: relative;
    }

    .question-box p {
      margin: 0 0 16px;
      color: #1e293b;
      font-size: 20px;
      font-weight: 500;
      line-height: 1.6;
    }

    .choices {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .choice-btn {
      padding: 12px 16px;
      background: linear-gradient(135deg, #f3e8ff 0%, #e0d5ff 100%);
      border: 2px solid #c4b5fd;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 600;
      color: #5b21b6;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: left;
    }

    .choice-btn:hover {
      background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
      border-color: #a78bfa;
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.2);
    }

    .choice-btn.selected {
      background: linear-gradient(135deg, #a5f3fc 0%, #67e8f9 100%);
      border-color: #06b6d4;
      color: #0e7490;
      font-weight: 700;
    }

    .photo-btn {
      width: 100%;
      padding: 14px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 19px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
    }

    .photo-btn:hover {
      transform: translateY(-2px);
      filter: brightness(1.02);
      box-shadow: 0 6px 22px rgba(102, 126, 234, 0.45);
    }

    .photo-btn:active {
      transform: translateY(0);
    }

    .photo-btn:focus-visible {
      outline: 3px solid rgba(255, 255, 255, 0.75);
      outline-offset: 2px;
    }

    .photo-hint {
      margin: 10px 0 0;
      font-size: 16px;
      line-height: 1.35;
      color: #475569;
    }

    .photo-preview {
      margin-top: 14px;
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .photo-preview img {
      width: 100%;
      height: auto;
      max-width: 100%;
      max-height: 65vh;
      object-fit: contain;
      border-radius: 14px;
      border: 2px solid #e2e8f0;
      background: #f8fafc;
    }

    .read-more-btn {
      width: 100%;
      padding: 14px 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.28);
    }

    .read-more-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(59, 130, 246, 0.38);
    }

    .card-footer {
      position: relative;
      z-index: 1;
      padding: 24px;
      background: rgba(248, 250, 252, 0.98);
      border-top: 2px solid #e2e8f0;
    }

    .save-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 22px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 16px rgba(34, 197, 94, 0.18);
    }

    .save-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(34, 197, 94, 0.26);
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    }

    .empty-state h3 {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 12px;
    }

    .empty-state p {
      font-size: 16px;
      color: #64748b;
      margin: 0;
    }

    .answer-feedback {
      padding: 16px;
      border-radius: 12px;
      margin: 16px 0;
      border-left: 4px solid #dc2626;
      background: #fee2e2;
    }

    .answer-feedback.correct {
      border-left-color: #16a34a;
      background: #dcfce7;
    }

    .answer-feedback .feedback-title {
      font-weight: 700;
      margin: 0 0 8px;
      font-size: 20px;
    }

    .answer-feedback.correct .feedback-title {
      color: #15803d;
    }

    .answer-feedback.incorrect .feedback-title {
      color: #b91c1c;
    }

    .answer-feedback .feedback-message {
      font-size: 18px;
      color: #374151;
      margin: 0 0 12px;
      line-height: 1.5;
    }

    .continue-btn {
      width: 100%;
      padding: 12px 16px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 19px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 16px;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .continue-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
    }

    .share-btn {
      width: 100%;
      padding: 14px 16px;
      margin-top: 12px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
    }

    .share-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(59, 130, 246, 0.4);
    }

    .share-link {
      margin-top: 12px;
      padding: 14px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #e2e8f0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }

    .share-link-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 8px;
      overflow-wrap: anywhere;
    }

    .share-link-input {
      width: 100%;
      padding: 12px 12px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      font-size: 14px;
      color: #0f172a;
      background: #ffffff;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .share-link-input:focus-visible {
      outline: 3px solid rgba(59, 130, 246, 0.25);
      outline-offset: 2px;
    }

    .share-link-hint {
      margin: 8px 0 0;
      font-size: 12px;
      color: #64748b;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    @media (max-width: 640px) {
      .missions-page {
        padding: 16px;
      }

      .checkpoint-name {
        font-size: 26px;
      }

      .section-title {
        font-size: 19px;
      }

      .mission-text,
      .task-list,
      .question-box p {
        font-size: 18px;
      }

      .choice-btn,
      .photo-btn,
      .continue-btn {
        font-size: 17px;
      }

      .save-btn {
        font-size: 19px;
      }
    }

    /* Completion Popup Styles */
    .completion-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
      animation: fadeIn 0.25s ease-in-out;
      padding: 18px;
      box-sizing: border-box;
    }

    .completion-popup {
      background: rgba(255, 255, 255, 0.98);
      border-radius: 18px;
      padding: 30px 22px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
      max-width: 420px;
      width: 100%;
      border: 3px solid rgba(34, 197, 94, 0.65);
      animation: slideUp 0.25s ease-out;
    }

    .completion-popup .confetti {
      font-size: 38px;
      margin-bottom: 8px;
    }

    .completion-popup .success-icon {
      font-size: 46px;
      margin: 0 0 10px;
    }

    .completion-popup .popup-title {
      margin: 0 0 10px;
      font-size: 22px;
      font-weight: 800;
      color: #15803d;
    }

    .completion-popup .popup-message {
      margin: 0;
      font-size: 14px;
      color: #334155;
      line-height: 1.5;
    }

    .completion-popup .celebration-emoji {
      margin-top: 14px;
      font-size: 20px;
      letter-spacing: 2px;
    }

    .mission-tutorial-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.68);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      z-index: 1200;
      // overflow-y: auto;
      // overscroll-behavior: contain;
    }

    .mission-tutorial-card {
      background: #ffffff;
      border-radius: 18px;
      padding: 24px;
      width: min(100%, 420px);
      max-height: 70%;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.26);
    }

    .mission-tutorial-card h4 {
      margin: 0 0 10px;
      font-size: 20px;
      color: #166534;
    }

    .mission-tutorial-card p {
      margin: 0 0 16px;
      color: #334155;
      line-height: 1.5;
    }

    .mission-tutorial-image {
      display: block;
      width: 100%;
      max-width: 280px;
      height: auto;
      margin: 0 auto 12px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    }

    .mission-tutorial-helper-text {
      margin: 0 0 16px;
      font-size: 15px;
      color: #475569;
      line-height: 1.5;
      text-align: center;
    }

    /* Position help button inside the mission card (top-right of card) */
    .mission-card { position: relative; }
    .help-btn {
      position: absolute;
      top: 18px;
      right: 18px;
      z-index: 20;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
      color: white;
      font-size: 20px;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.18);
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .help-btn:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(16, 185, 129, 0.22); }
    .help-btn:focus-visible { outline: 3px solid rgba(16, 185, 129, 0.24); outline-offset: 2px; }

    .completion-confirm-btn {
      width: 100%;
      border: none;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, #166534 0%, #22c55e 100%);
      color: #ffffff;
    }

    .mission-tutorial-btn {
      width: 100%;
      border: none;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, #166534 0%, #22c55e 100%);
      color: #ffffff;
    }

    /* Upload Notification Styles */
    .upload-notification-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.3s ease-in-out;
    }

    .upload-notification-popup {
      background: white;
      border-radius: 16px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 400px;
      width: 90%;
      animation: slideUp 0.3s ease-out;
      border: 4px solid #ccc;
    }

    .upload-notification-overlay.success .upload-notification-popup {
      border-color: #22c55e;
    }

    .upload-notification-overlay.error .upload-notification-popup {
      border-color: #ef4444;
    }

    .notification-icon {
      font-size: 48px;
      margin-bottom: 16px;
      animation: bounce 0.6s ease-out;
    }

    .notification-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #1e293b;
    }

    .upload-notification-overlay.success .notification-title {
      color: #16a34a;
    }

    .upload-notification-overlay.error .notification-title {
      color: #dc2626;
    }

    .notification-message {
      font-size: 14px;
      color: #64748b;
      margin: 0;
      line-height: 1.5;
    }

    .notification-actions {
      margin-top: 18px;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .notification-close-btn {
      width: 100%;
      max-width: 220px;
      padding: 10px 18px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      color: white;
      background: #22c55e;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      box-shadow: 0 4px 14px rgba(34, 197, 94, 0.25);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .notification-close-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(34, 197, 94, 0.35);
    }

    .notification-close-btn:active {
      transform: translateY(0);
    }

    .notification-close-btn:focus-visible {
      outline: 3px solid rgba(34, 197, 94, 0.35);
      outline-offset: 2px;
    }

    @keyframes bounce {
      0% {
        transform: scale(0);
      }
      50% {
        transform: scale(1.1);
      }
      100% {
        transform: scale(1);
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .youtube-container {
      position: relative;
      width: 100%;
      margin: 16px 0;
      padding-bottom: 56.25%; /* 16:9 aspect ratio */
      height: 0;
      overflow: hidden;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .youtube-player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 8px;
    }
  `]
})
export class MissionsComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private injector = inject(Injector);
  private storage = inject(StorageService);
  private imageUploadService = inject(ImageUploadService);
  private locationTracking = inject(LocationTrackingService);
  private baseDataService = inject(BaseDataService);
  private nav: NavigationService = inject(NavigationService);
  private router: Router = inject(Router);
  public languageService: LanguageService = inject(LanguageService);
  public audio: AudioService = inject(AudioService);

  private readonly checkpointBgImages = [
    'forest1.jpg',
    'forest2.jpg',
    'forest3.jpg',
    'forest4.jpg',
    'forest6.jpg',
    'waterfall.jpg'
  ];

  checkpoints: WritableSignal<Checkpoint[]> = signal([]);
  private lastHydratedCheckpointId: number | null = null;

  // Activities shown in the UI (may be a single randomized activity).
  activitiesToDisplay: string[] = [];

  private readonly syncEffect = effect(
    () => {
      if (!isPlatformBrowser(this.platformId)) return;

      // track language changes
      this.languageService.currentLanguage();

      const baseCheckpoints = this.baseDataService.getCheckpointsDataSignal()();
      if (baseCheckpoints.length === 0) return;

      this.syncFromBase(baseCheckpoints);
    },
    { injector: this.injector }
  );

  private readonly checkpointHydrationEffect = effect(
    () => {
      if (!isPlatformBrowser(this.platformId)) return;

      const id = this.nav.getCurrentCheckpointId();
      // Touch checkpoints so hydration occurs after base load as well.
      this.checkpoints();

      if (id === this.lastHydratedCheckpointId) return;
      this.lastHydratedCheckpointId = id;

      // Reset per-checkpoint UI state when switching.
      this.selectedAnswerChoice = null;
      this.answerFeedback = null;

      this.hydrateCurrentCheckpointState();
    },
    { injector: this.injector }
  );

  currentCheckpoint = computed(() => {
    const id = this.nav.getCurrentCheckpointId();
    return this.checkpoints().find(c => c.id === id) || null;
  });

  // form state
  answer = '';
  photo: string | null = null;
  shareLink = '';
  showShareLinkInput = false;
  selectedQuestion: Question | null = null;
  showCompletionPopup = false;
  showMissionTypeTutorial = false;
  checkpointTutorialPages: TutorialPageConfig[] = [];
  checkpointTutorialPageIndex = 0;
  missionTutorialMessage = '';
  manualTutorialTitle: string | null = null;
  selectedAnswerChoice: string | null = null; // User's selected answer choice
  answerFeedback: { isCorrect: boolean; message: string; correctAnswer?: string } | null = null; // Feedback after answer
  uploadNotification = {
    show: false,
    isSuccess: false,
    title: '',
    message: '',
    navigateToMapOnClose: false
  };

  private readonly tutorialService = inject(TutorialService);

  constructor() { }

  // Expose translations for template
  get t() {
    return this.languageService.t();
  }

  get checkpointTutorialTitle(): string {
    if (this.checkpointTutorialPages.length === 0) {
      return this.t.missions.checkpointTutorialTitle;
    }

    const page = this.checkpointTutorialPages[this.checkpointTutorialPageIndex];
    const titleKey = page.titleKey as keyof typeof this.t.missions;
    return this.t.missions[titleKey] || this.t.missions.checkpointTutorialTitle;
  }

  getCheckpointBackgroundUrl(checkpointId: number): string {
    const safeId = Number.isFinite(checkpointId) ? checkpointId : 1;
    const index = Math.abs(safeId - 1) % this.checkpointBgImages.length;
    return `/assets/checkpoint_bg/${this.checkpointBgImages[index]}`;
  }

  getCompletionPopupTitle(): string {
    return this.t.missions.missionComplete;
  }

  getCompletionPopupMessage(): string {
    const cp = this.currentCheckpoint();
    return `${this.t.missions.missionCompleteMsg} ${cp?.id ?? ''}.`;
  }

  confirmCompletionPopup(): void {
    this.showCompletionPopup = false;
    // The checkpoint-16 "go to checkpoint 17 via the same route" message is now shown
    // inside this completion popup itself, so no query-param handoff to the map is needed.
    this.router.navigate(['/map']);
  }

  get tutorialOverlayTitle(): string {
    if (this.manualTutorialTitle) {
      return this.manualTutorialTitle;
    }

    if (this.checkpointTutorialPages.length === 0) {
      return this.t.missions.checkpointTutorialTitle;
    }

    const page = this.checkpointTutorialPages[this.checkpointTutorialPageIndex];
    const titleKey = page.titleKey as keyof typeof this.t.missions;
    return this.t.missions[titleKey] || this.t.missions.checkpointTutorialTitle;
  }

  get tutorialIllustrationSrc(): string {
    const lang = (this.languageService.currentLanguage()?.code ?? 'th') as 'th' | 'en';
    if (this.isPhotoTutorialFlow) {
      return this.checkpointTutorialPageIndex === 0
        ? `/assets/tutorial/take_photo_button_${lang === 'th' ? 'th' : 'en'}.jpg`
        : '/assets/tutorial/after_take_photo.jpg';
    }

    if (this.isQuestionTutorialFlow) {
      return '/assets/tutorial/question_box.jpg';
    }

    return `/assets/tutorial/save_button_${lang === 'th' ? 'th' : 'en'}.jpg`;
  }

  get tutorialHelperText(): string {
    const missions = this.t.missions as Record<string, string>;

    if (this.isPhotoTutorialFlow) {
      if (this.checkpointTutorialPageIndex === 0) {
        return missions['missionTutorialPhotoHintPage1'] || '';
      }
      return missions['missionTutorialPhotoHintPage2'] || '';
    }
    if (this.isQuestionTutorialFlow) {
      return missions['missionTutorialQuestionHint'] || '';
    }

    return missions['missionTutorialSaveHint'] || '';
  }

  get isQuestionTutorialFlow(): boolean {
    const cp = this.currentCheckpoint();
    return this.showMissionTypeTutorial && !!cp && (cp.type === 'question_botany' || cp.type === 'question_forest_bathing');
  }

  get isPhotoTutorialFlow(): boolean {
    return this.checkpointTutorialPages.some(page =>
      page.messageKey === 'missionTutorialPhotoMessagePage1' || page.messageKey === 'missionTutorialPhotoMessagePage2'
    );
  }

  getMissionTypeTutorialForCheckpoint(cp: Checkpoint | null): { title: string; message: string } | null {
    if (!cp) return null;

    const missions = this.t.missions as any;
    switch (cp.type) {
      case 'question_botany':
      case 'question_forest_bathing':
        return { title: missions.missionTutorialTitle, message: missions.missionTutorialQuestion };
      case 'activity_forest_bathing_photo':
        return { title: missions.missionTutorialTitle, message: missions.missionTutorialPhoto };
      case 'activity_forest_bathing':
        return { title: missions.missionTutorialTitle, message: missions.missionTutorialActivity };
      case 'writing_reflection':
        return { title: missions.missionTutorialTitle, message: missions.missionTutorialReflection };
      default:
        if (cp.activity || (cp.steps && cp.steps.length > 0)) {
          return { title: missions.missionTutorialTitle, message: missions.missionTutorialActivity };
        }
        return null;
    }
  }

  showMissionTypeHelp(): void {
    const cp = this.currentCheckpoint();
    if (!cp) return;

    // Special-case: photo missions have a two-page tutorial
    if (cp.type === 'activity_forest_bathing_photo') {
      this.checkpointTutorialPages = [
        { titleKey: 'missionTutorialPhotoTitlePage1', messageKey: 'missionTutorialPhotoMessagePage1' },
        { titleKey: 'missionTutorialPhotoTitlePage2', messageKey: 'missionTutorialPhotoMessagePage2' }
      ];
      this.checkpointTutorialPageIndex = 0;
      const page = this.checkpointTutorialPages[0];
      const missions = this.t.missions as any;
      this.missionTutorialMessage = missions[page.messageKey] || '';
      this.manualTutorialTitle = null;
      this.showMissionTypeTutorial = true;
      this.tutorialService.markMissionTypeTutorialSeen(cp.type);
      return;
    }

    const tutorial = this.getMissionTypeTutorialForCheckpoint(cp);
    if (!tutorial) return;
    this.manualTutorialTitle = tutorial.title;
    this.missionTutorialMessage = tutorial.message;
    this.checkpointTutorialPages = [];
    this.checkpointTutorialPageIndex = 0;
    this.showMissionTypeTutorial = true;
    const type = cp.type;
    if (type) this.tutorialService.markMissionTypeTutorialSeen(type);
  }

  trackByCheckpointId(index: number, cp: Checkpoint): number {
    return cp.id;
  }

  selectMission(id: number): void {
    this.nav.setCurrentCheckpointId(id);
    this.hydrateCurrentCheckpointState();
  }

  isInRadius(): boolean {
    return this.nav.getInRadius();
  }

  getChoiceKeys(question: Question): string[] {
    // Preserve JSON/insertion order (e.g. ก, ข, ค, ...) so labels map consistently.
    return Object.keys(question.choices);
  }

  formatChoiceLabel(originalKey: string, index: number): string {
    const lang = (this.languageService.currentLanguage()?.code ?? 'th') as 'th' | 'en';
    if (lang !== 'en') return originalKey;

    // A, B, C... (fallback to numeric if out of range)
    if (index >= 0 && index < 26) return String.fromCharCode(65 + index);
    return String(index + 1);
  }

  getCheckpointOneNoteTitle(): string {
    const lang = (this.languageService.currentLanguage()?.code ?? 'th') as 'th' | 'en';
    return lang === 'th' ? 'บันทึกความรู้สึก' : 'Reflection';
  }

  getCheckpointOneNotePlaceholder(): string {
    const lang = (this.languageService.currentLanguage()?.code ?? 'th') as 'th' | 'en';
    return lang === 'th'
      ? 'พิมพ์ความรู้สึกของคุณที่นี่...'
      : 'Type your reflection here...';
  }

  submitQuestionAnswer(): void {
    if (!this.selectedQuestion || !this.selectedAnswerChoice) return;

    const correctKey = this.selectedQuestion.correctAnswer;
    if (!correctKey) return;
    const isCorrect = this.selectedAnswerChoice === correctKey;

    const keys = this.getChoiceKeys(this.selectedQuestion);
    const correctIndex = keys.indexOf(correctKey);
    const correctLabel = this.formatChoiceLabel(correctKey, correctIndex);

    const isBotany = this.currentCheckpoint()?.type === 'question_botany';
    const t = this.t;
    const message = isBotany
      ? (isCorrect ? t.missions.feedbackBotanyCorrect : t.missions.feedbackBotanyIncorrect)
      : (isCorrect ? t.missions.feedbackBathingCorrect : t.missions.feedbackBathingIncorrect);

    this.answerFeedback = {
      isCorrect,
      message,
      correctAnswer: `${correctLabel}: ${this.selectedQuestion.choices[correctKey]}`
    };
  }

  closeMissionTutorial(): void {
    this.showMissionTypeTutorial = false;
    this.missionTutorialMessage = '';
    this.manualTutorialTitle = null;
    this.checkpointTutorialPages = [];
    this.checkpointTutorialPageIndex = 0;
  }

  nextCheckpointTutorialPage(): void {
    if (this.checkpointTutorialPageIndex < this.checkpointTutorialPages.length - 1) {
      this.checkpointTutorialPageIndex += 1;
      const page = this.checkpointTutorialPages[this.checkpointTutorialPageIndex];
      this.missionTutorialMessage = this.t.missions[page.messageKey as keyof typeof this.t.missions] as string;
    } else {
      this.closeMissionTutorial();
    }
  }

  resetAnswerFeedback(): void {
    const cp = this.currentCheckpoint();
    if (!cp) return;
    this.checkpoints.update(list => list.map(c => c.id === cp.id ? ({ ...c, answer: this.answer, photo: this.photo || undefined, reached: true, ...(this.selectedQuestion ? { question: this.selectedQuestion } : {}) }) : c));
    this.storage.setMissions(this.checkpoints());
    if (cp.id === 16) {
      this.storage.setItem('showCheckpoint17RouteMessage', 'true');
    }

    // Stop tracking automatically when completing checkpoint 17.
    if (cp.id === 17) {
      this.locationTracking.stop();
    }

    // Show completion popup and wait for user confirmation
    this.showCompletionPopup = true;
  }

  openReadMore(checkpointId: number, url: string): void {
    if (!url) return;
    window.open(url, '_blank');

    // Earn a star once per checkpoint (shared with Map star counter)
    const starData = this.storage.getBotanyStars();
    const clicked = new Set<string>(starData?.readMoreClicked || []);
    const key = `checkpoint_${checkpointId}`;
    if (!clicked.has(key)) {
      clicked.add(key);
      this.storage.setBotanyStars({
        starsEarned: (starData?.starsEarned || 0) + 1,
        readMoreClicked: Array.from(clicked)
      });
    }

    // Mark as clicked and update in checkpoints
    this.checkpoints.update(checkpoints =>
      checkpoints.map(cp =>
        cp.id === checkpointId ? { ...cp, starEarned: true } : cp
      )
    );
    this.storage.setMissions(this.checkpoints());
  }

  ngOnInit() {
    // Skip initialization during SSR
    if (!isPlatformBrowser(this.platformId)) return;

    // Ensure base bilingual JSON is loaded (Map page also does this)
    this.baseDataService.loadBasesData().subscribe({
      next: () => {
        const baseCheckpoints = this.baseDataService.getCheckpointsDataSignal()();
        this.syncFromBase(baseCheckpoints);
      },
      error: (error) => {
        console.error('Failed to load base data:', error);
        const saved = this.storage.getMissions();
        if (saved && saved.length > 0) {
          this.checkpoints.set(saved);
          this.hydrateCurrentCheckpointState();
        } else {
          this.checkpoints.set([]);
        }
      }
    });
  }

  private filterHiddenCheckpoints(checkpoints: Checkpoint[]): Checkpoint[] {
    return this.isMission16Completed() ? checkpoints : checkpoints.filter(cp => cp.id !== 17);
  }

  private isMission16Completed(): boolean {
    const saved = this.storage.getMissions();
    const savedCheckpoint = saved?.find(cp => cp.id === 16);
    return !!(savedCheckpoint?.reached && (savedCheckpoint.answer || savedCheckpoint.photo || savedCheckpoint.question || savedCheckpoint.shareLink));
  }

  private syncFromBase(baseCheckpoints: Checkpoint[]): void {
    const visibleBaseCheckpoints = this.filterHiddenCheckpoints(baseCheckpoints);
    const saved = this.storage.getMissions();
    const visibleSaved = this.filterHiddenCheckpoints(saved || []);

    if (visibleSaved.length > 0) {
      const merged = visibleBaseCheckpoints.map(cp => {
        const savedCp = visibleSaved.find(s => s.id === cp.id);
        if (!savedCp) return cp;

        return {
          ...cp,
          reached: savedCp.reached,
          photo: savedCp.photo || undefined,
          answer: savedCp.answer || undefined,
          shareLink: savedCp.shareLink || undefined,
          question: savedCp.question ?? cp.question,
          starEarned: savedCp.starEarned ?? cp.starEarned
        };
      });

      this.checkpoints.set(merged);
    } else {
      this.checkpoints.set(visibleBaseCheckpoints);
      this.storage.setMissions(visibleBaseCheckpoints);
    }

    this.hydrateCurrentCheckpointState();
  }

  private hydrateCurrentCheckpointState(): void {
    const cp = this.currentCheckpoint();
    if (!cp) return;

    this.answer = cp.answer || '';
    this.photo = cp.photo || null;
    this.shareLink = cp.shareLink || '';
    this.showShareLinkInput = cp.id === 17;

    if (cp.questions && cp.questions.length > 0) {
      let idx = this.storage.getQuestionIndex(cp.id);

      if (idx === null || idx < 0 || idx >= cp.questions.length) {
        idx = Math.floor(Math.random() * cp.questions.length);
        this.storage.setQuestionIndex(cp.id, idx);
      }

      this.selectedQuestion = cp.questions[idx];
    } else {
      this.selectedQuestion = null;
    }

    // Activities shown in UI.
    // IMPORTANT: Keep randomizeActivities display-only to avoid rewriting the entire
    // missions payload (which may include base64 photos) into localStorage on entry.
    if (cp.activities && cp.activities.length > 0) {
      const shouldRandomize = cp.type === 'activity_forest_bathing_photo' || cp.randomizeActivities === true;
      if (shouldRandomize) {
        let idx = this.storage.getActivityIndex(cp.id);
        if (idx === null || idx < 0 || idx >= cp.activities.length) {
          idx = Math.floor(Math.random() * cp.activities.length);
          this.storage.setActivityIndex(cp.id, idx);
        }
        const selected = cp.activities[idx];
        this.activitiesToDisplay = selected ? [selected] : [];
      } else {
        this.activitiesToDisplay = cp.activities;
      }
    } else {
      this.activitiesToDisplay = [];
    }

    this.showCheckpointTutorialIfNeeded(cp);
  }

  private showCheckpointTutorialIfNeeded(cp: Checkpoint | null): void {
    if (!cp) {
      this.showMissionTypeTutorial = false;
      this.missionTutorialMessage = '';
      return;
    }

    if (!this.tutorialService.shouldShowCheckpointTutorial(cp.id)) {
      this.showMissionTypeTutorial = false;
      this.missionTutorialMessage = '';
      return;
    }

    const config = this.tutorialService.getCheckpointTutorial(cp.id);
    if (config && config.pages.length > 0) {
      this.checkpointTutorialPages = config.pages;
      this.checkpointTutorialPageIndex = 0;
      const page = this.checkpointTutorialPages[0];
      const missions = this.t.missions as any;
      this.missionTutorialMessage = missions[page.messageKey] || '';
      this.manualTutorialTitle = null;
      this.showMissionTypeTutorial = true;
      this.tutorialService.markCheckpointTutorialSeen(cp.id);
      return;
    }

    // If there's no checkpoint-specific tutorial, consider showing a mission-type tutorial
    const type = cp.type;
    if (type && this.tutorialService.shouldShowMissionTypeTutorial(type)) {
      // Photo missions should show a two-page tutorial
      if (type === 'activity_forest_bathing_photo') {
        this.checkpointTutorialPages = [
          { titleKey: 'missionTutorialPhotoTitlePage1', messageKey: 'missionTutorialPhotoMessagePage1' },
          { titleKey: 'missionTutorialPhotoTitlePage2', messageKey: 'missionTutorialPhotoMessagePage2' }
        ];
        this.checkpointTutorialPageIndex = 0;
        const page = this.checkpointTutorialPages[0];
        const missions = this.t.missions as any;
        this.missionTutorialMessage = missions[page.messageKey] || '';
        this.manualTutorialTitle = null;
        this.showMissionTypeTutorial = true;
        this.tutorialService.markMissionTypeTutorialSeen(type);
        return;
      }

      // Default single-page mission tutorial
      const tutorial = this.getMissionTypeTutorialForCheckpoint(cp);
      if (tutorial) {
        this.manualTutorialTitle = tutorial.title;
        this.missionTutorialMessage = tutorial.message;
        this.checkpointTutorialPages = [];
        this.checkpointTutorialPageIndex = 0;
        this.showMissionTypeTutorial = true;
        this.tutorialService.markMissionTypeTutorialSeen(type);
        return;
      }
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const cp = this.currentCheckpoint();
    const filename = cp
      ? `botany_checkpoint_${cp.id}_photo_${Date.now()}`
      : `botany_photo_${Date.now()}`;

    // Best-effort: save to the user's device (mobile only) + notify user.
    this.imageUploadService
      .savePhotoToDevice(file, { filename, onlyOnMobile: true })
      .then((status) => {
        if (status === 'skipped' || status === 'cancelled') return;

        const t = this.t;
        let title = t.missions.photoSavedTitle;
        let message = t.missions.photoSavedMsg;

        if (status === 'shared') {
          title = t.missions.photoSaveHelpTitle;
          message = t.missions.photoSaveHelpMsgShare;
        } else if (status === 'opened') {
          title = t.missions.photoSaveHelpTitle;
          message = t.missions.photoSaveHelpMsgIOS;
        }

        this.uploadNotification = { show: true, isSuccess: true, title, message, navigateToMapOnClose: false };
      })
      .catch(() => void 0);

    const reader = new FileReader();
    reader.onload = () => { this.photo = reader.result as string; };
    reader.readAsDataURL(file);

    // Allow selecting the same file again.
    input.value = '';
  }

  async saveMission(): Promise<void> {
    const cp = this.currentCheckpoint();
    if (!cp) return;

    const photoForStorage = this.photo
      ? await this.imageUploadService.compressPhotoDataUrl(this.photo).catch(() => this.photo!)
      : null;

    // update checkpoints array immutably
    this.checkpoints.update(list => list.map(c => c.id === cp.id ? ({ ...c, answer: this.answer, photo: photoForStorage || undefined, shareLink: (cp.id === 17 ? this.shareLink.trim() : c.shareLink), reached: true, ...(this.selectedQuestion ? { question: this.selectedQuestion } : {}) }) : c));
    this.storage.setMissions(this.checkpoints());
    if (cp.id === 16) {
      this.storage.setItem('showCheckpoint17RouteMessage', 'true');
    }

    // Stop tracking automatically when completing checkpoint 17.
    if (cp.id === 17) {
      this.locationTracking.stop();
    }

    // Photo saving is local-only (no API upload).
    // Upload photo to API if available
    if (photoForStorage) {
      this.sendPhotoToApi(cp.id, photoForStorage);
    }

    // Show completion popup and wait for user confirmation
    this.showCompletionPopup = true;
  }

  async shareCheckIn(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const cp = this.currentCheckpoint();
    if (!cp) {
      alert('No active checkpoint to share.');
      return;
    }

    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported on this device/browser.');
      return;
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    }).catch((error: any) => {
      const message = error?.message || 'Unable to access location. Please allow location permission.';
      alert(message);
      return null;
    });

    if (!position) return;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    const shareText = [
      `Forest Bathing Trail check-in`,
      `Checkpoint ${cp.id}: ${cp.name}`,
      `My location: ${mapsUrl}`,
      `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    ].join('\n');

    // Try to attach a photo (if available) via Web Share files.
    const photoFile = this.photo
      ? this.dataUrlToFile(this.photo, `checkpoint-${cp.id}.jpg`)
      : null;
    const canShareFiles =
      !!photoFile &&
      'canShare' in navigator &&
      typeof (navigator as any).canShare === 'function' &&
      (navigator as any).canShare({ files: [photoFile] });

    // Native share sheet (lets user pick the app)
    if ('share' in navigator) {
      try {
        await (navigator as any).share(
          canShareFiles
            ? {
              title: 'Botany Check-in',
              text: shareText,
              url: mapsUrl,
              files: [photoFile],
            }
            : {
              title: 'Botany Check-in',
              text: shareText,
              url: mapsUrl,
            }
        );

        // After user shares, show the link input so they can paste the post link.
        this.showShareLinkInput = true;
        return;
      } catch (e: any) {
        // User cancelling share is not an error; just silently return.
        if (e?.name === 'AbortError') return;
      }
    }

    // Fallback: copy share text to clipboard
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        alert('Share text copied to clipboard. Paste it into your app to check in.');
      } else {
        alert(shareText);
      }
    } catch {
      alert(shareText);
    }

    // In fallback flows, still show the link input for paste.
    this.showShareLinkInput = true;
  }

  private dataUrlToFile(dataUrl: string, filename: string): File | null {
    try {
      const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
      if (!match) return null;
      const mime = match[1];
      const b64 = match[2];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], filename, { type: mime });
    } catch {
      return null;
    }
  }

  persistShareLink(): void {
    const cp = this.currentCheckpoint();
    if (!cp || cp.id !== 17) return;

    const next = this.shareLink.trim();
    this.checkpoints.update(list => list.map(c => c.id === cp.id ? ({ ...c, shareLink: next }) : c));
    this.storage.setMissions(this.checkpoints());
  }

  sendPhotoToApi(checkpointId: number, photoData: string) {
    // Download photo to user's device instead of uploading to API.
    // iOS Safari often ignores anchor download / blob URL flows, so we use a data URL
    // that opens in the native image viewer/share sheet for a more reliable save experience.
    const cp = this.checkpoints().find(c => c.id === checkpointId);
    const filename = `botany_checkpoint_${checkpointId}_${cp?.name || 'photo'}_${Date.now()}`;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent || '')) {
      window.open(photoData, '_blank', 'noopener,noreferrer');
    } else {
      const link = document.createElement('a');
      link.href = photoData;
      link.download = `${filename}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Show success notification
    this.uploadNotification = {
      show: true,
      isSuccess: true,
      title: this.t.missions.photoSavedTitle,
      message: `${this.t.missions.photoSavedForCheckpointMsg} ${checkpointId}`,
      navigateToMapOnClose: true
    };
  }

  closeUploadNotification(): void {
    const shouldNavigate = !!this.uploadNotification.navigateToMapOnClose;
    this.uploadNotification.show = false;
    this.uploadNotification.navigateToMapOnClose = false;

    if (shouldNavigate) {
      this.router.navigate(['/map']);
    }
  }

  private formatUploadError(error: any): string {
    // Avoid dumping huge HTML/objects into the popup on mobile.
    const fallback = 'Failed to upload photo. Please try again.';

    const status = error?.status;
    if (status === 0) {
      return 'Cannot reach the server. Please check your internet connection.';
    }

    let message: any = error?.error?.message;

    if (!message && typeof error?.error === 'string') {
      // Some servers return HTML or plain text in error bodies.
      message = error.error;
    }

    if (!message) {
      message = error?.message || error?.statusText;
    }

    if (!message) return fallback;

    if (typeof message !== 'string') {
      try {
        message = JSON.stringify(message);
      } catch {
        return fallback;
      }
    }

    // Strip HTML tags and collapse whitespace.
    message = message.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!message) return fallback;

    // Keep popup readable.
    const maxLen = 160;
    if (message.length > maxLen) {
      message = message.slice(0, maxLen).trimEnd() + '…';
    }

    return message;
  }

}
