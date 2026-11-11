import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-mobile-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-page.component.html',
  styleUrls: ['./mobile-page.component.scss']
})
export class MobilePageComponent {
  private platformId = inject(PLATFORM_ID);

  constructor() {
    // Check if the device is mobile (only in browser)
    if (isPlatformBrowser(this.platformId) && window.innerWidth > 768) {
      // Redirect to a different page or show warning for desktop users
      alert('This page is optimized for mobile devices only.');
    }
  }
}
