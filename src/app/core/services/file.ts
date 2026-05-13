import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Matches the backend CodeFileDto exactly. */
export interface CodeFile {
  fileId?: number;
  projectId: number;
  name: string;
  path: string;
  language?: string;
  content?: string;
  size?: number;
  isDirectory?: boolean;
  createdBy?: string;
  lastEditedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/files`;

  /** Get all active files/folders for a project. */
  getProjectFiles(projectId: number): Observable<CodeFile[]> {
    return this.http.get<CodeFile[]>(`${this.apiUrl}/project/${projectId}`);
  }

  /** Get the file tree (sorted: dirs first, then alphabetical). */
  getFileTree(projectId: number): Observable<CodeFile[]> {
    return this.http.get<CodeFile[]>(`${this.apiUrl}/project/${projectId}/tree`);
  }

  /** Get full file details including content. */
  getFileContent(fileId: number): Observable<CodeFile> {
    return this.http.get<CodeFile>(`${this.apiUrl}/${fileId}`);
  }

  /** Create a new file. */
  createFile(file: Partial<CodeFile>): Observable<CodeFile> {
    return this.http.post<CodeFile>(this.apiUrl, file);
  }

  /** Create a new folder. */
  createFolder(projectId: number, path: string, name: string): Observable<CodeFile> {
    return this.http.post<CodeFile>(`${this.apiUrl}/folder`, { projectId, path, name });
  }

  /** Update the text content of a file. */
  updateFileContent(fileId: number, content: string): Observable<CodeFile> {
    return this.http.put<CodeFile>(`${this.apiUrl}/${fileId}/content`, { content });
  }

  /** Rename a file or folder. */
  renameFile(fileId: number, newName: string): Observable<CodeFile> {
    return this.http.put<CodeFile>(`${this.apiUrl}/${fileId}/rename`, { newName });
  }

  /** Move a file or folder to a new path. */
  moveFile(fileId: number, newPath: string): Observable<CodeFile> {
    return this.http.put<CodeFile>(`${this.apiUrl}/${fileId}/move`, { newPath });
  }

  /** Soft-delete a file (or folder with children). */
  deleteFile(fileId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${fileId}`);
  }

  /** Restore a soft-deleted file. */
  restoreFile(fileId: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${fileId}/restore`, {});
  }

  /** Search within a project by filename or content. */
  searchInProject(projectId: number, query: string): Observable<CodeFile[]> {
    return this.http.get<CodeFile[]>(`${this.apiUrl}/project/${projectId}/search?q=${encodeURIComponent(query)}`);
  }

  /**
   * Upload a file from disk into a project.
   * Sends multipart/form-data with fields: projectId, path, file.
   */
  uploadFile(projectId: number, path: string, file: File): Observable<CodeFile> {
    const form = new FormData();
    form.append('projectId', projectId.toString());
    form.append('path', path);
    form.append('file', file, file.name);
    return this.http.post<CodeFile>(`${this.apiUrl}/upload`, form);
  }
}
