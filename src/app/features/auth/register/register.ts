import { Component, inject, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { finalize, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrls: ['../login/login.css', './register.css']
})
export class Register implements OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private readonly strongPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  step: 'register' | 'otp' = 'register';

  registerForm = this.fb.group({
    fullName: ['', Validators.required],
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(this.strongPasswordPattern)
    ]]
  });

  otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  errorMessage = '';
  successMessage = '';
  isRegistering = false;
  isVerifying = false;

  // OTP expiry timer
  otpTimerSeconds = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private readonly OTP_EXPIRY_SECONDS = 300; // 5 minutes

  onSubmit() {
    this.registerForm.markAllAsTouched();

    if (this.registerForm.valid) {
      this.isRegistering = true;
      this.errorMessage = '';
      this.successMessage = '';

      const { fullName, username, email, password } = this.registerForm.getRawValue();
      const normalizedEmail = (email || '').trim().toLowerCase();

      this.authService.emailExists(normalizedEmail).pipe(
        switchMap((exists) => {
          if (exists) {
            this.registerForm.get('email')?.setErrors({ duplicateEmail: true });
            return throwError(() => new Error('A user with this email already exists.'));
          }

          return this.authService.register({
            fullName: fullName || '',
            username: username || '',
            email: normalizedEmail,
            password: password || ''
          });
        }),
        finalize(() => {
          this.isRegistering = false;
        })
      ).subscribe({
        next: () => {
          this.successMessage = 'OTP sent! Please check your email.';
          this.step = 'otp';
          this.startOtpTimer();
        },
        error: (err) => {
          this.step = 'register';
          this.successMessage = '';
          this.stopOtpTimer();
          this.errorMessage = this.extractRegistrationError(err);
        }
      });
    }
  }

  onOtpSubmit() {
    this.otpForm.markAllAsTouched();

    if (this.otpForm.valid) {
      this.isVerifying = true;
      this.errorMessage = '';
      this.successMessage = '';

      const email = this.registerForm.get('email')?.value || '';
      const otp = this.otpForm.get('otp')?.value || '';

      this.authService.verifyAndRegister(email, otp).subscribe({
        next: () => {
          this.isVerifying = false;
          this.stopOtpTimer();
          
          // Flash a success message and then navigate to login
          this.successMessage = 'Registration successful! Redirecting to login...';
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 3000);
        },
        error: (err) => {
          this.isVerifying = false;
          this.errorMessage = this.extractError(err, 'Invalid OTP. Please try again.');
        }
      });
    }
  }

  goBackToRegister() {
    this.step = 'register';
    this.errorMessage = '';
    this.successMessage = '';
    this.otpForm.reset();
    this.stopOtpTimer();
  }

  get formattedTimer(): string {
    const min = Math.floor(this.otpTimerSeconds / 60);
    const sec = this.otpTimerSeconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  get isOtpExpired(): boolean {
    return this.otpTimerSeconds <= 0 && this.step === 'otp';
  }

  private startOtpTimer() {
    this.otpTimerSeconds = this.OTP_EXPIRY_SECONDS;
    this.stopOtpTimer(); // Clear any existing timer
    this.timerInterval = setInterval(() => {
      this.otpTimerSeconds--;
      if (this.otpTimerSeconds <= 0) {
        this.stopOtpTimer();
        this.errorMessage = 'OTP has expired. Please go back and try again.';
      }
    }, 1000);
  }

  private stopOtpTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Safely extract a human-readable error string */
  private extractError(err: any, fallback: string): string {
    if (typeof err?.error === 'string') return err.error;
    if (typeof err?.error?.message === 'string') return err.error.message;
    if (typeof err?.message === 'string' && err.status === 0) return 'Cannot connect to server. Please check your connection.';
    return fallback;
  }

  private extractRegistrationError(err: any): string {
    const message = this.extractError(err, 'Failed to send OTP. Please try again.');
    const normalized = message.toLowerCase();

    if (normalized.includes('email already exists') || normalized.includes('email already registered')) {
      return 'A user with this email already exists.';
    }

    return message;
  }

  loginWithGoogle() {
    window.location.href = `${environment.apiUrl}/oauth2/authorization/google`;
  }

  loginWithGithub() {
    window.location.href = `${environment.apiUrl}/oauth2/authorization/github`;
  }

  ngOnDestroy() {
    this.stopOtpTimer();
  }
}
