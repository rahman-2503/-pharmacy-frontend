import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const userStr = localStorage.getItem('pharmacare_user_session');

  // Only attach a token if one isn't already explicitly set on the request.
  // (The login flow sets a fresh token itself — we must not clobber it with a
  // possibly stale token from a previous session, which caused 401s on /users/{id}.)
  let authReq = req;
  if (!req.headers.has('Authorization') && userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.token) {
        authReq = req.clone({
          headers: req.headers.set('Authorization', `Bearer ${user.token}`)
        });
      }
    } catch (e) {
      console.error('AuthInterceptor failed to parse token from session', e);
    }
  }

  const router = inject(Router);

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Token expired/invalid -> clear session and send the user to login
      // (but never intercept the login call itself).
      if (err.status === 401 && !req.url.includes('/users/login') && !req.url.includes('/users/signup')) {
        localStorage.removeItem('pharmacare_user_session');
        if (!router.url.startsWith('/login')) {
          router.navigate(['/login']);
        }
      }
      return throwError(() => err);
    })
  );
};
