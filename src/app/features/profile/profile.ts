import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { timeout } from 'rxjs';
import { AuthService, UserProfile, UpdateProfileRequest, ChangePasswordRequest } from '../../core/services/auth';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css']
})
export class Profile implements OnInit {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private cdr         = inject(ChangeDetectorRef);

  profile: UserProfile | null = null;
  isLoading = false;   // false initially — spinner only while fetching
  error = '';
  successMessage = '';

  // Edit mode
  isEditing = false;
  editForm: UpdateProfileRequest = {};
  isSaving = false;

  // Password change
  showPasswordForm = false;
  passwordForm: ChangePasswordRequest & { confirmPassword: string } = {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  passwordError = '';
  passwordSuccess = '';
  isChangingPassword = false;

  // Danger zone
  showDeactivateConfirm = false;

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.isLoading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.authService.getProfile()
      .pipe(
        timeout(20000),
        finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })
      )
      .subscribe({
        next: (profile) => {
          this.profile = profile;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.error = 'Request timed out. Make sure the backend is running.';
          } else if (err?.status === 401) {
            this.error = 'Session expired. Please log in again.';
          } else if (err?.status === 0) {
            this.error = 'Cannot reach server. Please check that the backend is running.';
          } else {
            this.error = err?.error?.message || err?.error || 'Failed to load profile. Please try again.';
          }
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Edit Profile ──────────────────────────────────────────────────────────

  startEditing() {
    if (!this.profile) return;
    this.editForm = {
      fullName:  this.profile.fullName  || '',
      username:  this.profile.username  || '',
      bio:       this.profile.bio       || '',
      avatarUrl: this.profile.avatarUrl || ''
    };
    this.isEditing = true;
    this.successMessage = '';
    this.cdr.markForCheck();
  }

  cancelEditing() {
    this.isEditing = false;
    this.editForm = {};
    this.cdr.markForCheck();
  }

  saveProfile() {
    this.isSaving = true;
    this.error = '';
    this.cdr.markForCheck();

    this.authService.updateProfile(this.editForm).subscribe({
      next: (updated) => {
        this.profile = updated;
        this.isEditing = false;
        this.isSaving = false;
        this.successMessage = 'Profile updated successfully!';
        this.cdr.markForCheck();
        setTimeout(() => { this.successMessage = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.error = err.error?.message || err.error || 'Failed to update profile';
        this.isSaving = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Change Password ──────────────────────────────────────────────────────

  togglePasswordForm() {
    this.showPasswordForm = !this.showPasswordForm;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.passwordForm = { oldPassword: '', newPassword: '', confirmPassword: '' };
    this.cdr.markForCheck();
  }

  changePassword() {
    this.passwordError = '';
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.passwordError = 'New passwords do not match';
      this.cdr.markForCheck();
      return;
    }
    if (this.passwordForm.newPassword.length < 6) {
      this.passwordError = 'Password must be at least 6 characters';
      this.cdr.markForCheck();
      return;
    }
    this.isChangingPassword = true;
    this.cdr.markForCheck();

    this.authService.changePassword({
      oldPassword: this.passwordForm.oldPassword,
      newPassword: this.passwordForm.newPassword
    }).subscribe({
      next: () => {
        this.passwordSuccess = 'Password changed successfully!';
        this.isChangingPassword = false;
        this.passwordForm = { oldPassword: '', newPassword: '', confirmPassword: '' };
        this.cdr.markForCheck();
        setTimeout(() => { this.passwordSuccess = ''; this.showPasswordForm = false; this.cdr.markForCheck(); }, 3000);
      },
      error: (err) => {
        this.passwordError = err.error?.message || err.error || 'Failed to change password';
        this.isChangingPassword = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Deactivate Account ────────────────────────────────────────────────────

  deactivateAccount() {
    this.authService.deactivateAccount().subscribe({
      next: () => {
        this.authService.logout().subscribe();
        this.router.navigate(['/login']);
      },
      error: () => { this.error = 'Failed to deactivate account'; this.cdr.markForCheck(); }
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  getInitial(): string {
    if (!this.profile) return '?';
    return (this.profile.fullName || this.profile.username || this.profile.email || '?').charAt(0).toUpperCase();
  }

  getMemberSince(): string {
    if (!this.profile?.createdAt) return '';
    return new Date(this.profile.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }
}
