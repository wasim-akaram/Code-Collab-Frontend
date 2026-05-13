import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Project {
  id?: number;
  projectId?: number;
  ownerId?: number;
  ownerEmail?: string;
  name: string;
  description: string;
  language: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  archived?: boolean;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  starCount?: number;
  forkCount?: number;
  parentProjectId?: number;
  defaultBranch?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  language: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}

export interface ProjectMember {
  id?: number;
  projectId: number;
  userEmail: string;
  role: string;
  createdAt?: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/projects`;

  getProjects(): Observable<Project[]> {
    return this.getMyProjects();
  }

  getProject(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/${id}`).pipe(
      timeout(8000),
      map(p => this.normalizeProject(p))
    );
  }

  getMyProjects(): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/my`).pipe(
      timeout(15000),
      map(res => (res.content || []).map(project => this.normalizeProject(project)))
    );
  }

  getArchivedProjects(): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/archived`).pipe(
      timeout(15000),
      map(res => (res.content || []).map(project => this.normalizeProject(project)))
    );
  }

  getPublicProjects(): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/public`).pipe(
      timeout(15000),
      map(res => (res.content || []).map(project => this.normalizeProject(project)))
    );
  }

  getTrendingProjects(): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/trending`).pipe(
      timeout(15000),
      map(res => (res.content || []).map(project => this.normalizeProject(project)))
    );
  }

  searchProjects(searchTerm: string, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/search`, {
      params: { searchTerm, visibility }
    }).pipe(
      timeout(15000),
      map(res => (res.content || []).map(project => this.normalizeProject(project)))
    );
  }

  getProjectById(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/${id}`).pipe(
      map(project => this.normalizeProject(project))
    );
  }

  canEditProject(id: number): Observable<boolean> {
    return this.http.get<boolean>(`${this.apiUrl}/${id}/can-edit`);
  }

  createProject(project: CreateProjectRequest): Observable<Project> {
    return this.http.post<Project>(this.apiUrl, project).pipe(
      timeout(8000),
      map(createdProject => this.normalizeProject(createdProject))
    );
  }

  updateProject(id: number, project: CreateProjectRequest): Observable<Project> {
    return this.http.put<Project>(`${this.apiUrl}/${id}`, project).pipe(
      map(updatedProject => this.normalizeProject(updatedProject))
    );
  }

  deleteProject(id: number): Observable<string> {
    return this.http.delete(`${this.apiUrl}/${id}`, { responseType: 'text' });
  }

  archiveProject(id: number): Observable<Project> {
    return this.http.post<Project>(`${this.apiUrl}/${id}/archive`, {}).pipe(
      map(project => this.normalizeProject(project))
    );
  }

  forkProject(id: number): Observable<Project> {
    return this.http.post<Project>(`${this.apiUrl}/${id}/fork`, {}).pipe(
      map(project => this.normalizeProject(project))
    );
  }

  starProject(id: number): Observable<string> {
    return this.http.post(`${this.apiUrl}/${id}/star`, {}, { responseType: 'text' });
  }

  unstarProject(id: number): Observable<string> {
    return this.http.post(`${this.apiUrl}/${id}/unstar`, {}, { responseType: 'text' });
  }

  /** Filter by language — returns public + user's own non-archived projects. */
  getProjectsByLanguage(language: string): Observable<Project[]> {
    return this.http.get<PageResponse<Project>>(`${this.apiUrl}/by-language`, {
      params: { language }
    }).pipe(
      timeout(15000),
      map(res => (res.content || []).map(p => this.normalizeProject(p)))
    );
  }

  // ─── Member Management ────────────────────────────────────────────────────

  getProjectMembers(projectId: number): Observable<PageResponse<ProjectMember>> {
    return this.http.get<PageResponse<ProjectMember>>(`${this.apiUrl}/${projectId}/members`).pipe(
      timeout(10000)
    );
  }

  addMember(projectId: number, userEmail: string, role: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${projectId}/members`, { userEmail, role }).pipe(
      timeout(10000)
    );
  }

  removeMember(projectId: number, memberEmail: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/members/${encodeURIComponent(memberEmail)}`).pipe(
      timeout(10000)
    );
  }

  private normalizeProject(project: Project): Project {
    return {
      ...project,
      projectId: project.projectId ?? project.id,
      isArchived: project.isArchived ?? project.archived
    };
  }
}
