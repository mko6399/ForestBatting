import { Injectable, signal, WritableSignal } from '@angular/core';

/**
 * Global application state service
 * Manages shared state that needs to be accessible across multiple components
 */
@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  /**
   * Global sound enabled/disabled state
   * When true, audio will play; when false, audio is muted
   */
  soundEnabled: WritableSignal<boolean> = signal(false);

  constructor() { }

  /**
   * Toggle sound on/off
   */
  toggleSound(): void {
    this.soundEnabled.update(v => !v);
  }
}
