import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Matches the SnapshotDto on the backend (all new fields included). */
export interface SnapshotItem {
  snapshotId: number;
  projectId: number;
  fileId: number;
  authorId?: number;
  content: string;
  commitMessage?: string;
  createdByEmail?: string;
  /** SHA-256 hex digest of content for integrity verification. */
  hash?: string;
  /** ID of the preceding snapshot in the history chain. */
  parentSnapshotId?: number;
  branchName?: string;
  tag?: string;
  createdAt?: string;
}

export interface DiffResult {
  diff: string;
}

export interface CreateBranchRequest {
  fileId: number;
  sourceBranch: string;
  newBranch: string;
}

@Injectable({ providedIn: 'root' })
export class VersionService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/versions`;

  // ─── Snapshots ─────────────────────────────────────────────────────────────

  /** Create a new snapshot (commit). */
  createSnapshot(snapshot: Partial<SnapshotItem>): Observable<SnapshotItem> {
    return this.http.post<SnapshotItem>(`${this.baseUrl}/snapshots`, snapshot);
  }

  /** Get snapshot by ID. */
  getSnapshot(id: number): Observable<SnapshotItem> {
    return this.http.get<SnapshotItem>(`${this.baseUrl}/snapshots/${id}`);
  }

  /** Tag a snapshot (e.g. "v1.0.0"). */
  tagSnapshot(id: number, tag: string): Observable<SnapshotItem> {
    return this.http.post<SnapshotItem>(`${this.baseUrl}/snapshots/${id}/tag`, { tag });
  }

  /**
   * Non-destructive restore: asks the backend to create a NEW snapshot
   * with the content from the given snapshot ID.
   */
  restoreSnapshot(id: number): Observable<SnapshotItem> {
    return this.http.post<SnapshotItem>(`${this.baseUrl}/snapshots/${id}/restore`, {});
  }

  // ─── File History ──────────────────────────────────────────────────────────

  /** Get file history on a specific branch (default: main). */
  getFileHistory(fileId: number, branch: string = 'main'): Observable<SnapshotItem[]> {
    return this.http.get<SnapshotItem[]>(`${this.baseUrl}/files/${fileId}/history?branch=${branch}`);
  }

  /** Get all snapshots for a file across ALL branches. */
  getSnapshotsByFile(fileId: number): Observable<SnapshotItem[]> {
    return this.http.get<SnapshotItem[]>(`${this.baseUrl}/files/${fileId}/snapshots`);
  }

  /** Get the latest snapshot for a file on a branch. */
  getLatestSnapshot(fileId: number, branch: string = 'main'): Observable<SnapshotItem> {
    return this.http.get<SnapshotItem>(`${this.baseUrl}/files/${fileId}/latest?branch=${branch}`);
  }

  // ─── Project-scoped ────────────────────────────────────────────────────────

  /** Get all snapshots for a project across all branches. */
  getSnapshotsByProject(projectId: number): Observable<SnapshotItem[]> {
    return this.http.get<SnapshotItem[]>(`${this.baseUrl}/projects/${projectId}/snapshots`);
  }

  /** Get all distinct branch names for a project. */
  getBranches(projectId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/projects/${projectId}/branches`);
  }

  // ─── Diff ──────────────────────────────────────────────────────────────────

  /** Get unified diff between two snapshots. */
  getDiff(oldId: number, newId: number): Observable<DiffResult> {
    return this.http.get<DiffResult>(`${this.baseUrl}/diff?oldId=${oldId}&newId=${newId}`);
  }

  // ─── Branches ──────────────────────────────────────────────────────────────

  /** Create a new branch by copying the latest snapshot from sourceBranch. */
  createBranch(req: CreateBranchRequest): Observable<SnapshotItem> {
    return this.http.post<SnapshotItem>(`${this.baseUrl}/branches`, {
      fileId: String(req.fileId),
      sourceBranch: req.sourceBranch,
      newBranch: req.newBranch
    });
  }
}
