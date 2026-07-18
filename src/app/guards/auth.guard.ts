import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isLoggedIn() && authService.isAdmin()) {
    return true;
  }
  
  console.warn('Access denied to admin path. Redirecting to login.');
  router.navigate(['/login']);
  return false;
};

export const doctorGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isLoggedIn() && authService.isDoctor()) {
    return true;
  }
  
  console.warn('Access denied to doctor path. Redirecting to login.');
  router.navigate(['/login']);
  return false;
};
