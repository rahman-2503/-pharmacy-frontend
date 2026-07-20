import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isLoggedIn() && authService.isAdmin()) {
    return true;
  }
  
  return router.parseUrl('/login?redirect=/admin');
};

export const doctorGuard = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isLoggedIn() && authService.isDoctor()) {
    return true;
  }
  
  return router.parseUrl('/login?redirect=/doctor');
};
