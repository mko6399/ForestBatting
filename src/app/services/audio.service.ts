import { Injectable, inject, PLATFORM_ID, signal, WritableSignal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private sanitizer = inject(DomSanitizer);

  private checkpointAudio: HTMLAudioElement | null = null;
  private backgroundAudio: HTMLAudioElement | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  private readonly checkpointSoundtrackPaths = [
    'assets/audio/checkpoint-soundtrack-01.mp3',
    'assets/audio/checkpoint-soundtrack-02.mp3',
    'assets/audio/checkpoint-soundtrack-03.mp3',
    'assets/audio/checkpoint-soundtrack-04.mp3',
    'assets/audio/checkpoint-soundtrack-05.mp3',
    'assets/audio/checkpoint-soundtrack-06.mp3'
  ];

  // Signal to track current YouTube video ID (kept for backward compatibility)
  currentYouTubeId: WritableSignal<string | null> = signal(null);

  /**
   * Check if a URL is a YouTube link
   */
  private isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com|youtu\.be)/.test(url) || /^[a-zA-Z0-9_-]{11}$/.test(url);
  }

  /**
   * Get sanitized YouTube embed URL (kept for backward compatibility)
   */
  getSafeYouTubeUrl(youtubeId: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&controls=1&fs=1&iv_load_policy=3&loop=0&rel=0&modestbranding=1`
    );
  }

  /**
   * Start (or resume) always-on background music.
   */
  startBackgroundAudio(
    audioPath: string = 'assets/audio/background-track.mp3',
    volume: number = 0.35,
    loop: boolean = true
  ): void {
    if (!this.isBrowser) return;

    if (!this.backgroundAudio) {
      this.backgroundAudio = new Audio(audioPath);
    }

    this.backgroundAudio.loop = loop;
    this.backgroundAudio.volume = Math.max(0, Math.min(1, volume));

    if (this.backgroundAudio.src && !this.backgroundAudio.src.endsWith(audioPath)) {
      this.backgroundAudio.src = audioPath;
      this.backgroundAudio.currentTime = 0;
    }

    this.backgroundAudio.play().catch(error => {
      console.error(`❌ Failed to play background audio: ${error}`);
    });
  }

  getRandomCheckpointSoundtrackPath(): string {
    const randomIndex = Math.floor(Math.random() * this.checkpointSoundtrackPaths.length);
    return this.checkpointSoundtrackPaths[randomIndex];
  }

  /**
   * Play audio for a checkpoint - supports MP3 files
   * YouTube links will use a fallback MP3 audio file due to browser CORS restrictions
   * @param checkpointId The checkpoint ID
   * @param audioSource The path to MP3 file or YouTube URL
   * @param loop Whether to loop the audio
   * @param volume Volume level (0-1)
   */
  playCheckpointAudio(
    checkpointId: number,
    audioSource: string,
    loop: boolean = true,
    volume: number = 1
  ): void {
    if (!this.isBrowser) {
      console.warn('Audio service: Not in browser environment');
      return;
    }

    console.log(`🎵 Checkpoint ${checkpointId}: Attempting to play: ${audioSource}`);

    // Check if it's a YouTube link (YouTube extraction requires backend server due to CORS)
    if (this.isYouTubeUrl(audioSource)) {
      console.warn(`⚠️ YouTube URLs cannot be extracted from browser due to CORS restrictions.`);
      console.info(`ℹ️ Using local audio file instead`);
      const localAudioUrl = this.getRandomCheckpointSoundtrackPath();
      this.playMp3Audio(checkpointId, localAudioUrl, loop, volume);
      return;
    }

    // Handle as regular MP3 file
    console.log(`🎵 Playing MP3 audio for checkpoint ${checkpointId}`);
    this.playMp3Audio(checkpointId, audioSource, loop, volume);
  }

  /**
   * Play MP3 audio file
   * @param checkpointId The checkpoint ID
   * @param audioPath The path to the audio file
   * @param loop Whether to loop the audio
   * @param volume Volume level (0-1)
   */
  private playMp3Audio(
    checkpointId: number,
    audioPath: string,
    loop: boolean = true,
    volume: number = 1
  ): void {
    // Clear YouTube ID when playing MP3
    this.currentYouTubeId.set(null);

    // Stop only currently playing checkpoint audio (keep background audio running)
    this.stopAudio();

    // Try to use cached audio or create new one
    const cacheKey = `checkpoint-${checkpointId}`;

    let audio = this.audioCache.get(cacheKey);
    if (!audio) {
      audio = new Audio(audioPath);
      this.audioCache.set(cacheKey, audio);
      console.log(`🎵 Created new audio element for: ${audioPath}`);
    } else {
      console.log(`♻️ Reusing cached audio element for checkpoint ${checkpointId}`);
    }

    audio.loop = loop;
    audio.volume = Math.max(0, Math.min(1, volume));

    // Add error and success event listeners
    audio.addEventListener('play', () => {
      console.log(`✅ Audio playing: ${audioPath}`);
    }, { once: true });

    audio.addEventListener('error', () => {
      console.error(`❌ Audio error for ${audioPath}:`, audio.error);
    }, { once: true });

    audio.addEventListener('loadstart', () => {
      console.log(`⏳ Loading audio: ${audioPath}`);
    }, { once: true });

    console.log(`▶️ Attempting to play audio: ${audioPath}`);
    audio.play().catch(error => {
      console.error(`❌ Failed to play checkpoint audio: ${error}`);
    });

    this.checkpointAudio = audio;
  }

  /**
   * Stop the currently playing audio
   */
  stopAudio(): void {
    if (this.checkpointAudio) {
      this.checkpointAudio.pause();
      this.checkpointAudio.currentTime = 0;
    }
    // Also clear YouTube ID
    this.currentYouTubeId.set(null);
  }

  /**
   * Pause the currently playing audio
   */
  pauseAudio(): void {
    if (this.checkpointAudio) {
      this.checkpointAudio.pause();
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
    }
  }

  /**
   * Resume the currently playing audio
   */
  resumeAudio(): void {
    if (this.backgroundAudio && this.backgroundAudio.paused) {
      this.backgroundAudio.play().catch(error => {
        console.error(`❌ Failed to resume background audio: ${error}`);
      });
    }

    if (this.checkpointAudio && this.checkpointAudio.paused) {
      console.log('▶️ Resuming audio playback');
      this.checkpointAudio.play().catch(error => {
        console.error(`❌ Failed to resume checkpoint audio: ${error}`);
      });
    }
  }

  /**
   * Set the volume of the currently playing audio
   * @param volume Volume level (0-1)
   */
  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));

    if (this.checkpointAudio) {
      this.checkpointAudio.volume = clamped;
    }

    if (this.backgroundAudio) {
      this.backgroundAudio.volume = clamped;
    }
  }

  /**
   * Clear the audio cache to free up memory
   */
  clearCache(): void {
    this.stopAudio();

    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
      this.backgroundAudio.src = '';
      this.backgroundAudio = null;
    }

    this.audioCache.forEach(audio => {
      audio.pause();
      audio.src = '';
    });
    this.audioCache.clear();
  }
}

