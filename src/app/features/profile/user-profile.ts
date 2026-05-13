import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService, UserProfile } from '../../core/services/auth';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.css']
})
export class UserProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);

  user: UserProfile | null = null;
  isLoading = true;
  error = '';

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || isNaN(id)) {
      this.error = 'Invalid user ID';
      this.isLoading = false;
      return;
    }
    this.authService.getUserById(id).subscribe({
      next: (user) => {
        this.user = user;
        this.isLoading = false;
      },
      error: () => {
        this.error = 'User not found';
        this.isLoading = false;
      }
    });
  }

  getInitial(): string {
    if (!this.user) return '?';
    return (this.user.fullName || this.user.username || '?').charAt(0).toUpperCase();
  }

  getMemberSince(): string {
    if (!this.user?.createdAt) return '';
    return new Date(this.user.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }
}
