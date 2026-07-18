import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const userStr = localStorage.getItem('pharmacare_user_session');
  
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.token) {
        const cloned = req.clone({
          headers: req.headers.set('Authorization', `Bearer ${user.token}`)
        });
        return next(cloned);
      }
    } catch (e) {
      console.error('AuthInterceptor failed to parse token from session', e);
    }
  }
  
  return next(req);
};
