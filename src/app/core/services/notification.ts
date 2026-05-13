import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, interval, of } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ─── Model Types ──────────────────────────────────────────────────────────────

export interface NotificationItem {
 notificationId: number;
 userEmail: string;
 actorEmail?: string;
 title?: string;
 type: string;
 message: string;
 referenceId?: number;
 referenceType?: string;
 isRead: boolean;
 createdAt?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class NotificationService {
 private http = inject(HttpClient);
 private baseUrl = `${environment.apiUrl}/notifications`;

 // Live unread count — drives the badge in the navbar
 readonly unreadCount$ = new BehaviorSubject<number>(0);

 // ─── REST API ───────────────────────────────────────────────────────────────

 /** Get all notifications for the current user. Logs errors for debugging but returns empty on failure. */
 getNotifications(): Observable<NotificationItem[]> {
 return this.http.get<NotificationItem[]>(this.baseUrl).pipe(
 catchError((err) => {
 console.warn('[NotificationService] getNotifications failed:', err?.status, err?.message || err);
 return of([]);
 })
 );
 }

 /** Get only unread notifications. Logs errors for debugging but returns empty on failure. */
 getUnread(): Observable<NotificationItem[]> {
 return this.http.get<NotificationItem[]>(`${this.baseUrl}/unread`).pipe(
 catchError((err) => {
 console.warn('[NotificationService] getUnread failed:', err?.status, err?.message || err);
 return of([]);
 })
 );
 }

 /**
 * Fetch the unread count and update the badge subject.
 * Logs errors for debugging but returns { count: 0 } and keeps badge at 0.
 */
 refreshUnreadCount(): Observable<{ count: number }> {
 return this.http.get<{ count: number }>(`${this.baseUrl}/unread/count`).pipe(
 tap(res => this.unreadCount$.next(res?.count ?? 0)),
 catchError((err) => {
 console.warn('[NotificationService] refreshUnreadCount failed:', err?.status, err?.message || err);
 return of({ count: 0 });
 })
 );
 }

 /** Mark a single notification as read. Fails silently. */
 markAsRead(notificationId: number): Observable<NotificationItem | null> {
 return this.http.put<NotificationItem>(`${this.baseUrl}/${notificationId}/read`, {}).pipe(
 catchError(() => of(null))
 );
 }

 /** Mark all notifications as read. Fails silently. */
 markAllAsRead(): Observable<void> {
 return this.http.put<void>(`${this.baseUrl}/read/all`, {}).pipe(
 tap(() => this.unreadCount$.next(0)),
 catchError(() => of(void 0))
 );
 }

 /** Delete a specific notification. Fails silently. */
 deleteNotification(notificationId: number): Observable<void> {
 return this.http.delete<void>(`${this.baseUrl}/${notificationId}`).pipe(
 catchError(() => of(void 0))
 );
 }

 /** Delete all notifications. Fails silently. */
 deleteAll(): Observable<void> {
 return this.http.delete<void>(this.baseUrl).pipe(
 tap(() => this.unreadCount$.next(0)),
 catchError(() => of(void 0))
 );
 }

 /**
 * Admin: Broadcast a notification to multiple recipients.
 */
 sendBulk(recipientEmails: string[], title: string, message: string, type = 'BROADCAST'): Observable<void> {
 return this.http.post<void>(`${this.baseUrl}/bulk`, { recipientEmails, title, message, type }).pipe(
 catchError(() => of(void 0))
 );
 }

 // ─── Polling ─────────────────────────────────────────────────────────────────

 /**
 * Starts a polling interval that refreshes the unread count every N ms.
 * Errors are caught inside refreshUnreadCount — polling never stops on failure.
 */
 startPolling(intervalMs = 30000): Observable<{ count: number }> {
 return interval(intervalMs).pipe(
 switchMap(() => this.refreshUnreadCount())
 );
 }

 // ─── Helpers ─────────────────────────────────────────────────────────────────

 getNotificationIcon(type: string): string {
 switch (type) {
 case 'COMMENT_MENTION': return '';
 case 'SESSION_JOIN': return '';
 case 'SESSION_INVITE': return '';
 case 'SESSION_KICKED': return '';
 case 'EXECUTION_COMPLETE': return '';
 case 'EXECUTION_FAILED': return '';
 case 'PROJECT_INVITE': return '';
 case 'PROJECT_FORKED': return '';
 case 'PROJECT_MEMBER_ADDED': return '';
 case 'BROADCAST': return '';
 default: return '';
 }
 }

 getTimeAgo(dateStr?: string): string {
 if (!dateStr) return '';
 const diff = Date.now() - new Date(dateStr).getTime();
 const mins = Math.floor(diff / 60000);
 if (mins < 1) return 'just now';
 if (mins < 60) return `${mins}m ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs}h ago`;
 return `${Math.floor(hrs / 24)}d ago`;
 }
}
