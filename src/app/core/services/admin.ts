import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserProfile } from './auth';

const API = environment.apiUrl;

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface AdminUserStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  adminCount: number;
  proUsers: number;
}

export interface AdminProjectStats {
  totalProjects: number;
  archivedProjects: number;
  publicProjects: number;
}

export interface CollabSessionDto {
  sessionId: string;
  projectId: number;
  fileId?: number;
  status: string;
  language?: string;
  maxParticipants: number;
  isPasswordProtected: boolean;
  participantCount: number;
  createdAt: string;
  endedAt?: string;
}

export interface ExecutionJobDto {
  jobId: string;
  projectId?: number;
  userEmail: string;
  language: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  createdAt: string;
  completedAt?: string;
}

export interface ExecutionPlatformStats {
  totalExecutions: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  // ─── User Management ─────────────────────────────────────────────────────────

  getAllUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${API}/auth/admin/users`);
  }

  suspendUser(id: number): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${API}/auth/admin/users/${id}/suspend`, {});
  }

  deleteUser(id: number): Observable<string> {
    return this.http.delete(`${API}/auth/admin/users/${id}`, { responseType: 'text' });
  }

  getUserStats(): Observable<AdminUserStats> {
    return this.http.get<AdminUserStats>(`${API}/auth/admin/stats`);
  }

  // ─── Project Management ──────────────────────────────────────────────────────

  getAllProjects(page = 0, size = 20): Observable<PageResponse<any>> {
    return this.http.get<PageResponse<any>>(`${API}/projects/admin/all?page=${page}&size=${size}`);
  }

  forceDeleteProject(id: number): Observable<string> {
    return this.http.delete(`${API}/projects/admin/${id}`, { responseType: 'text' });
  }

  getProjectStats(): Observable<AdminProjectStats> {
    return this.http.get<AdminProjectStats>(`${API}/projects/admin/stats`);
  }

  // ─── Session Management ──────────────────────────────────────────────────────

  getAllSessions(): Observable<CollabSessionDto[]> {
    return this.http.get<CollabSessionDto[]>(`${API}/sessions/admin/all`);
  }

  forceEndSession(sessionId: string): Observable<string> {
    return this.http.post(`${API}/sessions/admin/${sessionId}/force-end`, {}, { responseType: 'text' });
  }

  // ─── Execution Management ────────────────────────────────────────────────────

  getAllExecutions(): Observable<ExecutionJobDto[]> {
    return this.http.get<ExecutionJobDto[]>(`${API}/executions/admin/all`);
  }

  getPlatformStats(): Observable<ExecutionPlatformStats> {
    return this.http.get<ExecutionPlatformStats>(`${API}/executions/admin/stats`);
  }

  // ─── Broadcast ───────────────────────────────────────────────────────────────

  broadcastNotification(title: string, message: string): Observable<any> {
    return this.http.post(`${API}/notifications/send-bulk`, {
      title,
      message,
      actorEmail: 'system@codesync.io'
    });
  }
}
