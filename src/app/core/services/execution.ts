import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ExecutionJob {
  jobId: string;
  projectId: number;
  fileId?: number;
  userEmail?: string;
  language: string;
  sourceCode: string;
  fileName?: string;
  stdin?: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  createdAt?: string;
  completedAt?: string;
}

export interface ExecutionRequest {
  projectId: number;
  fileId?: number;
  language: string;
  sourceCode: string;
  fileName?: string;
  stdin?: string;
}

@Injectable({ providedIn: 'root' })
export class ExecutionService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/executions`;

  /** Submit code for execution. */
  submitExecution(request: ExecutionRequest): Observable<ExecutionJob> {
    return this.http.post<ExecutionJob>(this.baseUrl, request);
  }

  /** Get job status/result by jobId (poll this). */
  getJobById(jobId: string): Observable<ExecutionJob> {
    return this.http.get<ExecutionJob>(`${this.baseUrl}/${jobId}`);
  }

  /** Get execution result (alias). */
  getExecutionResult(jobId: string): Observable<ExecutionJob> {
    return this.http.get<ExecutionJob>(`${this.baseUrl}/${jobId}/result`);
  }

  /** Cancel an ongoing execution. */
  cancelExecution(jobId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${jobId}/cancel`, {});
  }

  /** Get supported languages. */
  getSupportedLanguages(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/languages`);
  }

  /** Get execution history for a project. */
  getExecutionsByProject(projectId: number): Observable<ExecutionJob[]> {
    return this.http.get<ExecutionJob[]>(`${this.baseUrl}/project/${projectId}`);
  }
}
