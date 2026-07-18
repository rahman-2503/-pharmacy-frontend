import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../models';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly USER_SESSION_KEY = 'pharmacare_user_session';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private apiService: ApiService) {
    this.loadSession();
  }

  private loadSession() {
    const session = localStorage.getItem(this.USER_SESSION_KEY);
    if (session) {
      try {
        this.currentUserSubject.next(JSON.parse(session));
      } catch (e) {
        localStorage.removeItem(this.USER_SESSION_KEY);
      }
    }
  }

  public login(credentials: { email: string; password?: string }): Observable<User> {
    return this.apiService.login(credentials).pipe(
      tap(user => {
        const sessionUser = { ...user };
        delete sessionUser.password; // Keep session secure
        localStorage.setItem(this.USER_SESSION_KEY, JSON.stringify(sessionUser));
        this.currentUserSubject.next(sessionUser);
      })
    );
  }

  public register(user: User): Observable<User> {
    return this.apiService.register(user);
  }

  public logout(): void {
    localStorage.removeItem(this.USER_SESSION_KEY);
    this.currentUserSubject.next(null);
  }

  public getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  public isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  public isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.role === 'admin';
  }

  public isDoctor(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.role === 'doctor';
  }
}
