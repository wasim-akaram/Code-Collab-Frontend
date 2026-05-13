import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CreateProjectRequest, ProjectService } from '../../../core/services/project';

@Component({
  selector: 'app-new-project',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './new-project.html',
  styleUrls: ['./new-project.css']
})
export class NewProject {
  private fb = inject(FormBuilder);
  private projectService = inject(ProjectService);
  private router = inject(Router);

  languages = ['Java', 'Python', 'JavaScript', 'TypeScript', 'C++', 'Go', 'Rust'];
  visibilities = ['PUBLIC', 'PRIVATE'];

  projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    language: ['JavaScript', Validators.required],
    visibility: ['PUBLIC', Validators.required]
  });

  isLoading = false;
  error = '';

  onSubmit() {
    this.projectForm.markAllAsTouched();

    if (this.projectForm.valid) {
      this.isLoading = true;
      this.error = '';

      try {
        const { name, description, language, visibility } = this.projectForm.getRawValue();
        const request: CreateProjectRequest = {
          name: name || '',
          description: description || '',
          language: language || 'JavaScript',
          visibility: visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
        };

        this.projectService.createProject(request).subscribe({
          next: (project) => {
            console.log('Project created:', project);
            this.isLoading = false;
            this.router.navigate(['/dashboard']);
          },
          error: (err) => {
            console.error('createProject error:', err);
            this.isLoading = false;
            this.error = this.extractError(err, 'Failed to create project. Please try again.');
          }
        });
      } catch (err: any) {
        console.error('Synchronous error:', err);
        this.isLoading = false;
        this.error = err?.message || 'Unexpected error occurred.';
      }
    }
  }

  private extractError(err: any, fallback: string): string {
    if (typeof err?.error === 'string') return err.error;
    if (typeof err?.error?.message === 'string') return err.error.message;
    if (err?.name === 'TimeoutError') return 'Request timed out. Please check if the backend service is running.';
    if (err?.status === 0) return 'Cannot connect to server. Please check that the backend is running.';
    return fallback;
  }
}
