import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommentItem {
  commentId: number;
  projectId: number;
  fileId: number;
  authorEmail?: string;
  content: string;
  lineNumber?: number;
  columnNumber?: number;
  parentCommentId?: number;
  resolved?: boolean;
  snapshotId?: number;
  createdAt?: string;
  updatedAt?: string;
  // Frontend-only fields
  replies?: CommentItem[];
  showReplies?: boolean;
  replyText?: string;
}

@Injectable({ providedIn: 'root' })
export class CommentService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/comments`;

  /** Add a new comment. */
  addComment(comment: Partial<CommentItem>): Observable<CommentItem> {
    return this.http.post<CommentItem>(this.baseUrl, comment);
  }

  /** Get all top-level comments for a file. */
  getCommentsByFile(fileId: number): Observable<CommentItem[]> {
    return this.http.get<CommentItem[]>(`${this.baseUrl}/file/${fileId}`);
  }

  /** Get replies for a comment. */
  getReplies(commentId: number): Observable<CommentItem[]> {
    return this.http.get<CommentItem[]>(`${this.baseUrl}/${commentId}/replies`);
  }

  /** Update a comment's content. */
  updateComment(commentId: number, content: string): Observable<CommentItem> {
    return this.http.put<CommentItem>(`${this.baseUrl}/${commentId}`, { content });
  }

  /** Delete a comment. */
  deleteComment(commentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${commentId}`);
  }

  /** Resolve a comment thread. */
  resolveComment(commentId: number): Observable<CommentItem> {
    return this.http.post<CommentItem>(`${this.baseUrl}/${commentId}/resolve`, {});
  }

  /** Unresolve a comment thread. */
  unresolveComment(commentId: number): Observable<CommentItem> {
    return this.http.post<CommentItem>(`${this.baseUrl}/${commentId}/unresolve`, {});
  }
}
