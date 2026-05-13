import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme';
import { AuthService } from '../../core/services/auth';
import { NotificationService, NotificationItem } from '../../core/services/notification';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class Navbar implements OnInit, OnDestroy {
  protected themeService  = inject(ThemeService);
  protected authService   = inject(AuthService);
  protected notifService  = inject(NotificationService);
  private router          = inject(Router);
  private cdr             = inject(ChangeDetectorRef);

  protected currentUser    = 'User';
  protected profileInitial = 'U';
  protected isAuthenticated = false;

  // Notification panel state
  protected showNotifPanel  = false;
  protected notifications: NotificationItem[] = [];
  protected isLoadingNotifs = false;
  protected unreadCount     = 0;

  private subs: Subscription[] = [];

  ngOnInit() {
    this.subs.push(
      this.authService.currentUser$.subscribe(user => {
        this.currentUser    = user || 'User';
        this.profileInitial = this.currentUser.charAt(0).toUpperCase();
        this.cdr.markForCheck();
      }),

      this.authService.isAuthenticated$.subscribe(auth => {
        this.isAuthenticated = auth;
        this.cdr.markForCheck();
        if (auth) {
          this.notifService.refreshUnreadCount().subscribe();
          const pollSub = this.notifService.startPolling(30000).subscribe();
          this.subs.push(pollSub);
        }
      }),

      this.notifService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  toggleTheme() {
    this.themeService.toggle();
  }

  toggleNotifPanel() {
    this.showNotifPanel = !this.showNotifPanel;
    this.cdr.markForCheck();
    if (this.showNotifPanel) {
      // Always reload so panel is fresh every time it's opened
      this.loadNotifications();
    }
  }

  closeNotifPanel() {
    this.showNotifPanel = false;
    this.cdr.markForCheck();
  }

  loadNotifications() {
    this.isLoadingNotifs = true;
    this.cdr.markForCheck();

    this.notifService.getNotifications().subscribe({
      next: (items) => {
        this.notifications   = items;
        this.isLoadingNotifs = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingNotifs = false;
        this.cdr.markForCheck();
      }
    });
  }

  markAsRead(notif: NotificationItem, event: Event) {
    event.stopPropagation();
    if (notif.isRead) return;
    this.notifService.markAsRead(notif.notificationId).subscribe({
      next: () => {
        notif.isRead = true;
        this.cdr.markForCheck();
        this.notifService.refreshUnreadCount().subscribe();
      }
    });
  }

  markAllRead() {
    this.notifService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => n.isRead = true);
        this.cdr.markForCheck();
      }
    });
  }

  deleteNotif(notif: NotificationItem, event: Event) {
    event.stopPropagation();
    this.notifService.deleteNotification(notif.notificationId).subscribe({
      next: () => {
        this.notifications = this.notifications.filter(n => n.notificationId !== notif.notificationId);
        this.notifService.refreshUnreadCount().subscribe();
        this.cdr.markForCheck();
      }
    });
  }

  clearAll() {
    this.notifService.deleteAll().subscribe({
      next: () => {
        this.notifications = [];
        this.cdr.markForCheck();
      }
    });
  }

  getIcon(type: string): string {
    return this.notifService.getNotificationIcon(type);
  }

  getTimeAgo(dateStr?: string): string {
    return this.notifService.getTimeAgo(dateStr);
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}
