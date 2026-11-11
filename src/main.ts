import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/*
  Everything is provided through appConfig. The previous project split providers between here
  and app.config.ts because of SSR; with client-side rendering there is only one bundle, so a
  single list avoids the duplicate-provider problem that split caused.
*/
bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
