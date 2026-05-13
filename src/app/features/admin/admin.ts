import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AdminService, AdminUserStats, AdminProjectStats,
  CollabSessionDto, ExecutionJobDto, ExecutionPlatformStats
} from '../../core/services/admin';
import { AuthService } from '../../core/services/auth';

type AdminTab = 'overview' | 'users' | 'projects' | 'sessions' | 'executions' | 'broadcast';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class Admin implements OnInit {
  private adminService = inject(AdminService);
  private authService  = inject(AuthService);
  private router       = inject(Router);

  // ─── State ──────────────────────────────────────────────────────────────────
  activeTab = signal<AdminTab>('overview');

  // Overview stats
  userStats     = signal<AdminUserStats | null>(null);
  projectStats  = signal<AdminProjectStats | null>(null);
  execStats     = signal<ExecutionPlatformStats | null>(null);

  // Data lists
  users         = signal<any[]>([]);
  projects      = signal<any[]>([]);
  sessions      = signal<CollabSessionDto[]>([]);
  executions    = signal<ExecutionJobDto[]>([]);

  // Broadcast
  broadcastTitle   = '';
  broadcastMessage = '';
  broadcastSent    = false;

  // UI state
  loading   = signal(false);
  error     = signal('');
  success   = signal('');

  // Search / filter
  userSearch    = '';
  userPlanFilter = 'ALL';
  projectSearch = '';
  projectVisFilter = 'ALL';
  execFilter    = 'ALL';

  filteredUsers = computed(() =>
    this.users().filter(u => {
      const matchSearch = !this.userSearch ||
        u.email?.toLowerCase().includes(this.userSearch.toLowerCase()) ||
        u.username?.toLowerCase().includes(this.userSearch.toLowerCase());
      const matchPlan = this.userPlanFilter === 'ALL' ||
        (this.userPlanFilter === 'PRO' && u.plan === 'PRO') ||
        (this.userPlanFilter === 'FREE' && u.plan !== 'PRO');
      return matchSearch && matchPlan;
    })
  );

  filteredProjects = computed(() =>
    this.projects().filter(p => {
      const matchSearch = !this.projectSearch ||
        p.name?.toLowerCase().includes(this.projectSearch.toLowerCase());
      const matchVis = this.projectVisFilter === 'ALL' ||
        p.visibility === this.projectVisFilter;
      return matchSearch && matchVis;
    })
  );

  filteredExecutions = computed(() =>
    this.executions().filter(e =>
      this.execFilter === 'ALL' || e.status === this.execFilter
    )
  );

  currentUserEmail = '';

  ngOnInit(): void {
    this.currentUserEmail = this.authService.getCurrentUserEmail();
    this.loadOverview();
  }

  // ─── Tab navigation ──────────────────────────────────────────────────────────
  setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    this.error.set('');
    this.success.set('');
    switch (tab) {
      case 'overview':   this.loadOverview();   break;
      case 'users':      this.loadUsers();      break;
      case 'projects':   this.loadProjects();   break;
      case 'sessions':   this.loadSessions();   break;
      case 'executions': this.loadExecutions(); break;
    }
  }

  // ─── Data loading ────────────────────────────────────────────────────────────
  loadOverview(): void {
    this.loading.set(true);
    this.adminService.getUserStats().subscribe({
      next: s => { this.userStats.set(s); this.loading.set(false); },
      error: e => { this.error.set('Failed to load user stats'); this.loading.set(false); }
    });
    this.adminService.getProjectStats().subscribe({
      next: s => this.projectStats.set(s),
      error: () => {}
    });
    this.adminService.getPlatformStats().subscribe({
      next: s => this.execStats.set(s),
      error: () => {}
    });
  }

  loadUsers(): void {
    this.loading.set(true);
    this.adminService.getAllUsers().subscribe({
      next: u => { this.users.set(u); this.loading.set(false); },
      error: e => { this.error.set('Failed to load users'); this.loading.set(false); }
    });
  }

  loadProjects(): void {
    this.loading.set(true);
    this.adminService.getAllProjects().subscribe({
      next: p => { this.projects.set(p.content); this.loading.set(false); },
      error: e => { this.error.set('Failed to load projects'); this.loading.set(false); }
    });
  }

  loadSessions(): void {
    this.loading.set(true);
    this.adminService.getAllSessions().subscribe({
      next: s => { this.sessions.set(s); this.loading.set(false); },
      error: e => { this.error.set('Failed to load sessions'); this.loading.set(false); }
    });
  }

  loadExecutions(): void {
    this.loading.set(true);
    this.adminService.getAllExecutions().subscribe({
      next: e => { this.executions.set(e); this.loading.set(false); },
      error: e => { this.error.set('Failed to load executions'); this.loading.set(false); }
    });
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────
  toggleSuspend(user: any): void {
    this.adminService.suspendUser(user.id).subscribe({
      next: updated => {
        this.users.update(list => list.map(u => u.id === user.id ? updated : u));
        this.success.set(`User ${updated.active ? 'unsuspended' : 'suspended'} successfully`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: () => this.error.set('Failed to update user status')
    });
  }

  deleteUser(user: any): void {
    if (!confirm(`Permanently delete user ${user.email}? This cannot be undone.`)) return;
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.users.update(list => list.filter(u => u.id !== user.id));
        this.success.set('User deleted');
        setTimeout(() => this.success.set(''), 3000);
      },
      error: () => this.error.set('Failed to delete user')
    });
  }

  forceDeleteProject(project: any): void {
    if (!confirm(`Force-delete project "${project.name}"?`)) return;
    this.adminService.forceDeleteProject(project.id).subscribe({
      next: () => {
        this.projects.update(list => list.filter(p => p.id !== project.id));
        this.success.set('Project deleted');
        setTimeout(() => this.success.set(''), 3000);
      },
      error: () => this.error.set('Failed to delete project')
    });
  }

  forceEndSession(session: CollabSessionDto): void {
    if (!confirm(`Force-end session ${session.sessionId}?`)) return;
    this.adminService.forceEndSession(session.sessionId).subscribe({
      next: () => {
        this.sessions.update(list =>
          list.map(s => s.sessionId === session.sessionId ? { ...s, status: 'ENDED' } : s)
        );
        this.success.set('Session terminated');
        setTimeout(() => this.success.set(''), 3000);
      },
      error: () => this.error.set('Failed to end session')
    });
  }

  sendBroadcast(): void {
    if (!this.broadcastTitle.trim() || !this.broadcastMessage.trim()) {
      this.error.set('Title and message are required');
      return;
    }
    this.loading.set(true);
    this.adminService.broadcastNotification(this.broadcastTitle, this.broadcastMessage).subscribe({
      next: () => {
        this.broadcastSent = true;
        this.broadcastTitle = '';
        this.broadcastMessage = '';
        this.success.set('Broadcast sent to all users!');
        this.loading.set(false);
        setTimeout(() => { this.success.set(''); this.broadcastSent = false; }, 5000);
      },
      error: () => { this.error.set('Failed to send broadcast'); this.loading.set(false); }
    });
  }

  // ─── Utils ───────────────────────────────────────────────────────────────────
  formatDate(d: string | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString();
  }

  execStatusClass(status: string): string {
    const map: Record<string, string> = {
      COMPLETED: 'badge-success',
      RUNNING:   'badge-info',
      QUEUED:    'badge-warning',
      FAILED:    'badge-danger',
      CANCELLED: 'badge-muted'
    };
    return map[status] ?? 'badge-muted';
  }

  sessionStatusClass(status: string): string {
    return status === 'ACTIVE' ? 'badge-success' : 'badge-muted';
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
