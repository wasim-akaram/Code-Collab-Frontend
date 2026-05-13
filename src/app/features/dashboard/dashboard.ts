import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { timeout, Subscription } from 'rxjs';
import { ProjectService, Project, CreateProjectRequest } from '../../core/services/project';
import { AuthService } from '../../core/services/auth';
import { NotificationService, NotificationItem } from '../../core/services/notification';

@Component({
 selector: 'app-dashboard',
 standalone: true,
 imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
 templateUrl: './dashboard.html',
 styleUrls: ['./dashboard.css']
})
export class Dashboard implements OnInit, OnDestroy {
 private projectService = inject(ProjectService);
 protected authService = inject(AuthService);
 private fb = inject(FormBuilder);
 private cdr = inject(ChangeDetectorRef);
 private notifService = inject(NotificationService);
 private subs = new Subscription();

 projects: Project[] = [];
 archivedProjects: Project[] = [];
 filteredProjects: Project[] = [];

 isLoading = false; // false initially — spinner only shown while a fetch is running
 isLoadingArchived = false;
 error = '';
 actionMessage = '';

 activeTab: 'active' | 'archived' = 'active';
 deletingProjectId: number | null = null;
 archivingProjectId: number | null = null;
 starringProjectId: number | null = null;

 // Notification state
 showNotifPanel = false;
 notifications: NotificationItem[] = [];
 isLoadingNotifs = false;
 unreadCount = 0;

 currentUser = '';
 currentUserEmail = '';

 // In-component confirmation (replaces window.confirm which can be blocked)
 confirmProjectId: number | null = null;
 confirmAction: 'archive' | 'delete' | null = null;
 confirmProjectName = '';

 // Edit modal state
 showEditModal = false;
 editingProject: Project | null = null;
 isUpdating = false;
 editError = '';

 editForm = this.fb.group({
 name: ['', [Validators.required, Validators.maxLength(100)]],
 description: ['', Validators.maxLength(500)],
 language: ['', Validators.required],
 visibility: ['PUBLIC', Validators.required]
 });

 languages = ['Java', 'Python', 'JavaScript', 'TypeScript', 'C++', 'Go', 'Rust', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin'];

 ngOnInit() {
 const payload = this.authService.getTokenPayload();
 this.currentUser = payload?.sub || payload?.username || 'User';
 this.currentUserEmail = this.authService.getCurrentUserEmail();
 this.subs.add(
 this.authService.currentUser$.subscribe(user => {
 if (user) { this.currentUser = user; this.cdr.markForCheck(); }
 })
 );
 this.loadProjects();

 // Start notification polling
 this.notifService.refreshUnreadCount().subscribe();
 this.subs.add(
 this.notifService.startPolling(30000).subscribe()
 );
 this.subs.add(
 this.notifService.unreadCount$.subscribe(count => {
 this.unreadCount = count;
 this.cdr.markForCheck();
 })
 );
 }

 ngOnDestroy() { this.subs.unsubscribe(); }

 // ─── Notification Panel ────────────────────────────────────────────────────

 toggleNotifPanel() {
 this.showNotifPanel = !this.showNotifPanel;
 this.cdr.markForCheck();
 if (this.showNotifPanel) this.loadNotifications();
 }

 closeNotifPanel() {
 this.showNotifPanel = false;
 this.cdr.markForCheck();
 }

 loadNotifications() {
 this.isLoadingNotifs = true;
 this.cdr.markForCheck();
 this.notifService.getNotifications().subscribe({
 next: (items) => { this.notifications = items; this.isLoadingNotifs = false; this.cdr.markForCheck(); },
 error: () => { this.isLoadingNotifs = false; this.cdr.markForCheck(); }
 });
 }

 markNotifAsRead(notif: NotificationItem, event: Event) {
 event.stopPropagation();
 if (notif.isRead) return;
 this.notifService.markAsRead(notif.notificationId).subscribe({
 next: () => { notif.isRead = true; this.cdr.markForCheck(); this.notifService.refreshUnreadCount().subscribe(); }
 });
 }

 markAllNotifsRead() {
 this.notifService.markAllAsRead().subscribe({
 next: () => { this.notifications.forEach(n => n.isRead = true); this.cdr.markForCheck(); }
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

 clearAllNotifs() {
 this.notifService.deleteAll().subscribe({
 next: () => { this.notifications = []; this.cdr.markForCheck(); }
 });
 }

 getNotifIcon(type: string): string { return this.notifService.getNotificationIcon(type); }
 getTimeAgo(dateStr?: string): string { return this.notifService.getTimeAgo(dateStr); }

 loadProjects() {
 this.isLoading = true;
 this.error = '';
 this.cdr.markForCheck();
 this.projectService.getMyProjects()
 .pipe(
 timeout(20000),
 finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })
 )
 .subscribe({
 next: (data) => {
 this.projects = data;
 this.filteredProjects = data;
 this.cdr.markForCheck();
 },
 error: (err) => {
 if (err?.name === 'TimeoutError') {
 this.error = 'Request timed out. Make sure all backend services are running.';
 } else if (err?.status === 401) {
 this.error = 'Session expired. Please log in again.';
 } else if (err?.status === 0) {
 this.error = 'Cannot connect to server. Please check that the backend is running.';
 } else {
 this.error = this.extractError(err, 'Failed to load projects. Please try again.');
 }
 this.cdr.markForCheck();
 }
 });
 }

 loadArchivedProjects() {
 if (this.archivedProjects.length > 0) return; // already loaded
 this.isLoadingArchived = true;
 this.cdr.markForCheck();
 this.projectService.getArchivedProjects()
 .pipe(finalize(() => { this.isLoadingArchived = false; this.cdr.markForCheck(); }))
 .subscribe({
 next: (data) => {
 this.archivedProjects = data;
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.error = this.extractError(err, 'Failed to load archived projects.');
 this.cdr.markForCheck();
 }
 });
 }

 switchTab(tab: 'active' | 'archived') {
 this.activeTab = tab;
 this.error = '';
 this.actionMessage = '';
 this.cancelConfirm();
 if (tab === 'archived') {
 this.loadArchivedProjects();
 }
 }

 get profileInitial(): string {
 return (this.currentUser || 'U').charAt(0).toUpperCase();
 }

 get isAdmin(): boolean {
 return this.authService.getTokenPayload()?.role === 'ADMIN';
 }

 isOwner(project: Project): boolean {
 return project.ownerEmail === this.currentUserEmail;
 }

 onSearch(event: Event) {
 const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
 this.filteredProjects = this.projects.filter(project =>
 project.name.toLowerCase().includes(query) ||
 (project.description || '').toLowerCase().includes(query) ||
 (project.language || '').toLowerCase().includes(query)
 );
 }

 // ⭐ Star / Unstar
 toggleStar(event: Event, project: Project) {
 event.preventDefault();
 event.stopPropagation();
 const projectId = project.id ?? project.projectId;
 if (!projectId || this.starringProjectId === projectId) return;

 this.starringProjectId = projectId;
 const isStarred = (project as any)._starred;
 const action$ = isStarred
 ? this.projectService.unstarProject(projectId)
 : this.projectService.starProject(projectId);

 action$.pipe(finalize(() => { this.starringProjectId = null; }))
 .subscribe({
 next: () => {
 project.starCount = (project.starCount ?? 0) + (isStarred ? -1 : 1);
 (project as any)._starred = !isStarred;
 this.cdr.markForCheck();
 },
 error: () => {
 this.cdr.markForCheck();
 }
 });
 }

 // ── In-component confirmation ──────────────────────────────────────────────

 /** Shows inline confirm bar instead of window.confirm() */
 requestConfirm(event: Event, project: Project, action: 'archive' | 'delete') {
 event.preventDefault();
 event.stopPropagation();
 const projectId = project.id ?? project.projectId;
 if (!projectId) return;
 this.confirmProjectId = projectId;
 this.confirmAction = action;
 this.confirmProjectName = project.name;
 }

 cancelConfirm() {
 this.confirmProjectId = null;
 this.confirmAction = null;
 this.confirmProjectName = '';
 }

 executeConfirm() {
 if (this.confirmAction === 'archive') {
 this._doArchive(this.confirmProjectId!);
 } else if (this.confirmAction === 'delete') {
 this._doDelete(this.confirmProjectId!);
 }
 this.cancelConfirm();
 }

 // Archive (called after confirmation)
 private _doArchive(projectId: number) {
 this.archivingProjectId = projectId;
 const project = this.projects.find(p => (p.id ?? p.projectId) === projectId);
 this.projectService.archiveProject(projectId)
 .pipe(finalize(() => { this.archivingProjectId = null; }))
 .subscribe({
 next: () => {
 this.projects = this.projects.filter(p => (p.id ?? p.projectId) !== projectId);
 this.filteredProjects = this.filteredProjects.filter(p => (p.id ?? p.projectId) !== projectId);
 this.archivedProjects = []; // reset so it reloads when tab is visited
 this.actionMessage = `"${project?.name ?? 'Project'}" archived.`;
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.error = this.extractError(err, 'Failed to archive project.');
 this.cdr.markForCheck();
 }
 });
 }

 // Edit modal
 openEdit(event: Event, project: Project) {
 event.preventDefault();
 event.stopPropagation();
 this.editingProject = project;
 this.editError = '';
 this.editForm.patchValue({
 name: project.name,
 description: project.description || '',
 language: project.language,
 visibility: project.visibility
 });
 this.showEditModal = true;
 }

 closeEdit() {
 this.showEditModal = false;
 this.editingProject = null;
 this.editError = '';
 }

 saveEdit() {
 if (!this.editForm.valid || !this.editingProject) return;
 const projectId = this.editingProject.id ?? this.editingProject.projectId;
 if (!projectId) return;

 this.isUpdating = true;
 this.editError = '';

 const { name, description, language, visibility } = this.editForm.getRawValue();
 const request: CreateProjectRequest = {
 name: name || '',
 description: description || '',
 language: language || 'JavaScript',
 visibility: visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
 };

 this.projectService.updateProject(projectId, request)
 .pipe(
 timeout(15000),
 finalize(() => { this.isUpdating = false; })
 )
 .subscribe({
 next: (updated) => {
 const idx = this.projects.findIndex(p => (p.id ?? p.projectId) === projectId);
 if (idx !== -1) this.projects[idx] = updated;
 const fi = this.filteredProjects.findIndex(p => (p.id ?? p.projectId) === projectId);
 if (fi !== -1) this.filteredProjects[fi] = updated;
 this.actionMessage = `"${updated.name}" updated.`;
 this.closeEdit();
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.editError = this.extractError(err, 'Failed to update project.');
 this.cdr.markForCheck();
 }
 });
 }

 // Delete (called after confirmation)
 private _doDelete(projectId: number) {
 const project = this.projects.find(p => (p.id ?? p.projectId) === projectId)
 ?? this.archivedProjects.find(p => (p.id ?? p.projectId) === projectId);
 this.deletingProjectId = projectId;
 this.error = '';
 this.actionMessage = '';

 this.projectService.deleteProject(projectId)
 .pipe(
 timeout(15000),
 finalize(() => { this.deletingProjectId = null; })
 )
 .subscribe({
 next: () => {
 this.projects = this.projects.filter(item => (item.id ?? item.projectId) !== projectId);
 this.filteredProjects = this.filteredProjects.filter(item => (item.id ?? item.projectId) !== projectId);
 this.archivedProjects = this.archivedProjects.filter(item => (item.id ?? item.projectId) !== projectId);
 this.actionMessage = `"${project?.name ?? 'Project'}" deleted.`;
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.error = this.extractError(err, 'Failed to delete project. Please try again.');
 this.cdr.markForCheck();
 }
 });
 }

 // Keep old method signatures in HTML compatible — proxy to requestConfirm
 archiveProject(event: Event, project: Project) {
 this.requestConfirm(event, project, 'archive');
 }

 deleteProject(event: Event, project: Project) {
 this.requestConfirm(event, project, 'delete');
 }

 logout() {
 this.authService.logout().subscribe(() => {
 window.location.href = '/login';
 });
 }

 formatDate(date?: string): string {
 if (!date) return 'Unknown';
 return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
 }

 private extractError(err: any, fallback: string): string {
 if (typeof err?.error === 'string') return err.error;
 if (typeof err?.error?.message === 'string') return err.error.message;
 if (err?.name === 'TimeoutError') return 'Request timed out. Please check that backend services are running.';
 if (err?.status === 0) return 'Cannot connect to server. Please check that the backend is running.';
 return fallback;
 }
}
