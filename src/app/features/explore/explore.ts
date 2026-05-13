import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Navbar } from '../../shared/navbar/navbar';
import { ProjectService, Project } from '../../core/services/project';
import { AuthService, UserProfile } from '../../core/services/auth';
import { debounceTime, Subject, switchMap, of, catchError, finalize, timeout } from 'rxjs';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, Navbar],
  templateUrl: './explore.html',
  styleUrls: ['./explore.css']
})
export class Explore implements OnInit {
  private projectService = inject(ProjectService);
  private authService   = inject(AuthService);
  private cdr           = inject(ChangeDetectorRef);

  // ─── Tab state ──────────────────────────────────────────────────────────────
  activeTab: 'projects' | 'users' = 'projects';

  // ─── Projects state ─────────────────────────────────────────────────────────
  /** Master list — all projects fetched for the current sort mode. */
  allProjects: Project[] = [];
  /** Display list — result of applying language + search filters on allProjects. */
  filteredProjects: Project[] = [];

  isLoading  = false;   // starts false — spinner only shown when a fetch is active
  error      = '';
  sortMode: 'latest' | 'trending' = 'latest';
  searchQuery   = '';
  languageFilter = '';

  forkingProjectId: number | null = null;
  forkMessage = '';

  isLoggedIn = false;

  readonly availableLanguages = [
    'Java', 'Python', 'JavaScript', 'TypeScript', 'C++', 'Go', 'Rust',
    'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'C'
  ];

  // ─── Users state ────────────────────────────────────────────────────────────
  userSearchQuery  = '';
  users: UserProfile[] = [];
  isLoadingUsers   = false;
  userError        = '';

  private searchSubject     = new Subject<string>();
  private userSearchSubject = new Subject<string>();

  ngOnInit() {
    this.authService.isAuthenticated$.subscribe(auth => { this.isLoggedIn = auth; });

    // Load latest projects immediately on open
    this.fetchProjects();

    // Debounced in-memory text search (no extra HTTP call)
    this.searchSubject.pipe(debounceTime(250)).subscribe(term => {
      this.applyFilters();
    });

    // Debounced user search
    this.userSearchSubject.pipe(
      debounceTime(350),
      switchMap(term => {
        if (!term.trim()) { this.isLoadingUsers = false; return of([]); }
        this.isLoadingUsers = true;
        return this.authService.searchUsers(term).pipe(
          catchError(() => of([]))
        );
      })
    ).subscribe({
      next: (data) => { this.users = data; this.isLoadingUsers = false; },
      error: ()    => { this.isLoadingUsers = false; }
    });
  }

  // ─── Tab switching ──────────────────────────────────────────────────────────

  setTab(tab: 'projects' | 'users') {
    this.activeTab = tab;
  }

  // ─── Core fetch: load base project list based on sort mode ──────────────────

  /**
   * Fetches the base project list from the backend (latest or trending).
   * After fetching, client-side language + text filters are applied.
   */
  fetchProjects() {
    this.isLoading = true;
    this.error = '';
    this.forkMessage = '';
    this.cdr.markForCheck();

    const source$ = this.sortMode === 'trending'
      ? this.projectService.getTrendingProjects()
      : this.projectService.getPublicProjects();

    source$.pipe(
      timeout(20000),
      finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: (data) => {
        this.allProjects = data;
        this.applyFilters();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.allProjects = [];
        this.filteredProjects = [];
        if (err?.name === 'TimeoutError') {
          this.error = 'Request timed out. Make sure all backend services are running.';
        } else if (err?.status === 0) {
          this.error = 'Cannot connect to server. Please check that the backend is running.';
        } else {
          this.error = this.extractError(err, 'Could not load projects right now.');
        }
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Client-side filter: language + text search ──────────────────────────────

  /**
   * Applies language and text search filters on the already-fetched allProjects.
   * No HTTP call — instant UI update.
   */
  applyFilters() {
    let list = this.allProjects;

    if (this.languageFilter) {
      list = list.filter(p =>
        (p.language || '').toLowerCase() === this.languageFilter.toLowerCase()
      );
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.ownerEmail || '').toLowerCase().includes(q)
      );
    }

    this.filteredProjects = list;
    this.cdr.markForCheck();
  }

  // ─── Sort mode ──────────────────────────────────────────────────────────────

  setSortMode(mode: 'latest' | 'trending') {
    if (this.sortMode === mode) return;
    this.sortMode = mode;
    // Re-fetch from backend with new sort; keep existing filters in place
    this.fetchProjects();
  }

  // ─── Language filter ────────────────────────────────────────────────────────

  setLanguageFilter(lang: string) {
    // Toggle off if same language clicked again
    this.languageFilter = this.languageFilter === lang ? '' : lang;
    this.applyFilters();
  }

  // ─── Text search ────────────────────────────────────────────────────────────

  onSearch(event: Event) {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilters();
  }

  // ─── Fork ───────────────────────────────────────────────────────────────────

  forkProject(event: Event, project: Project) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isLoggedIn) { window.location.href = '/login'; return; }

    const projectId = project.id ?? project.projectId;
    if (!projectId || this.forkingProjectId === projectId) return;

    this.forkingProjectId = projectId;
    this.forkMessage = '';

    this.projectService.forkProject(projectId).subscribe({
      next: () => {
        project.forkCount = (project.forkCount ?? 0) + 1;
        this.forkMessage = `"${project.name}" forked successfully! Check your dashboard.`;
        this.forkingProjectId = null;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.forkMessage = this.extractError(err, 'Fork failed. Please try again.');
        this.forkingProjectId = null;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  onUserSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.userSearchQuery = query;
    if (!query.trim()) { this.users = []; return; }
    this.userSearchSubject.next(query);
  }

  getUserInitial(user: UserProfile): string {
    return (user.fullName || user.username || '?').charAt(0).toUpperCase();
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private extractError(err: any, fallback: string): string {
    if (typeof err?.error === 'string') return err.error;
    if (typeof err?.error?.message === 'string') return err.error.message;
    if (err?.name === 'TimeoutError') return 'Request timed out.';
    if (err?.status === 0) return 'Cannot connect to server.';
    if (err?.status === 401) return 'Login required.';
    return fallback;
  }
}
