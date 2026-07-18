import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { Notification } from '../../models';
import { Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  isLoggedIn = false;
  userRole: string | null = null;
  userName: string | null = null;
  userEmail: string | null = null;

  // Notifications
  notifications: Notification[] = [];
  showNotifs = false;
  private notifSub: Subscription | null = null;

  constructor(
    public authService: AuthService,
    private apiService: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
      this.userRole = user ? user.role : null;
      this.userName = user ? user.name : null;
      this.userEmail = user ? user.email : null;

      // Handle notification polling on login state change
      if (this.isLoggedIn && this.userEmail) {
        this.startNotificationPolling(this.userEmail);
      } else {
        this.stopNotificationPolling();
      }
    });
  }

  ngOnDestroy() {
    this.stopNotificationPolling();
  }

  private startNotificationPolling(email: string) {
    this.stopNotificationPolling();
    
    // Poll notifications every 5 seconds for real-time feel
    this.notifSub = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.apiService.getNotificationsByUser(email))
    ).subscribe({
      next: (notifs) => {
        this.notifications = notifs.sort((a,b) => (b.timestamp > a.timestamp ? 1 : -1));
      },
      error: (err) => console.error('Failed to load notifications', err)
    });
  }

  private stopNotificationPolling() {
    if (this.notifSub) {
      this.notifSub.unsubscribe();
      this.notifSub = null;
    }
    this.notifications = [];
    this.showNotifs = false;
  }

  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  getNotifIcon(type: string): string {
    switch (type) {
      case 'DRUG': return '💊';
      case 'PAYMENT': return '💳';
      case 'ORDER': return '📦';
      default: return '📢';
    }
  }

  toggleNotifs() {
    this.showNotifs = !this.showNotifs;
    // Mark all as read when opening
    if (this.showNotifs && this.userEmail) {
      this.apiService.markNotificationsAsRead(this.userEmail).subscribe();
      this.notifications.forEach(n => n.read = true);
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
