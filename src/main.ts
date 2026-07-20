import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initScrollReveal } from './app/shared/animations/reveal';

initScrollReveal();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
