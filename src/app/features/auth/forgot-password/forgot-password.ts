import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css']
})
export class ForgotPassword {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  /** Which step of the flow we're on */
  step: 'email' | 'otp' | 'done' = 'email';
  email = '';

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // ── Step 1: Email form ────────────────────────────────────────────────────
  emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  // ── Step 2: OTP + new password form ───────────────────────────────────────
  resetForm = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  // Timer
  otpTimeLeft = 300; // 5 minutes
  timerInterval: any = null;

  // ── Submit email ─────────────────────────────────────────────────────────

  sendOtp() {
    this.emailForm.markAllAsTouched();
    if (this.emailForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.email = (this.emailForm.getRawValue().email || '').toLowerCase().trim();

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.step = 'otp';
        this.startTimer();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = this.extractError(err, 'Could not send reset email. Please try again.');
      }
    });
  }

  // ── Submit OTP + new password ─────────────────────────────────────────────

  resetPassword() {
    this.resetForm.markAllAsTouched();
    if (this.resetForm.invalid) return;

    const { otp, newPassword, confirmPassword } = this.resetForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.resetPassword(this.email, otp || '', newPassword || '').subscribe({
      next: () => {
        this.isLoading = false;
        this.step = 'done';
        this.stopTimer();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = this.extractError(err, 'Password reset failed. Please check your OTP and try again.');
      }
    });
  }

  // ── Resend OTP ───────────────────────────────────────────────────────────

  resendOtp() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'A new OTP has been sent.';
        this.otpTimeLeft = 300;
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = this.extractError(err, 'Failed to resend OTP.');
      }
    });
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  private startTimer() {
    this.otpTimeLeft = 300;
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.otpTimeLeft--;
      if (this.otpTimeLeft <= 0) {
        this.stopTimer();
        this.errorMessage = 'OTP expired. Please request a new one.';
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  get formattedTime(): string {
    const m = Math.floor(this.otpTimeLeft / 60);
    const s = this.otpTimeLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  private extractError(err: any, fallback: string): string {
    if (typeof err?.error === 'string') return err.error;
    if (typeof err?.error?.message === 'string') return err.error.message;
    if (err?.status === 0) return 'Cannot connect to server. Please check that the backend is running.';
    return fallback;
  }
}
