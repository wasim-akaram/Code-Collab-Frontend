import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

// Eagerly-imported lightweight components — render instantly on click
import { Landing } from './features/landing/landing';
import { Explore } from './features/explore/explore';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';
import { OAuthCallback } from './features/auth/oauth-callback/oauth-callback';
import { Dashboard } from './features/dashboard/dashboard';
import { NewProject } from './features/dashboard/new-project/new-project';
import { Profile } from './features/profile/profile';
import { UserProfileComponent } from './features/profile/user-profile';
import { Pricing } from './features/pricing/pricing';

export const routes: Routes = [
  { path: '',               component: Landing,              pathMatch: 'full' },
  { path: 'explore',        component: Explore },
  { path: 'login',          component: Login },
  { path: 'register',       component: Register },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'oauth-callback', component: OAuthCallback },
  { path: 'dashboard',      component: Dashboard },
  { path: 'projects/new',   component: NewProject },
  { path: 'profile',        component: Profile },
  { path: 'pricing',        component: Pricing },
  { path: 'users/:id',      component: UserProfileComponent },
  // Editor and Admin use loadComponent to avoid pulling in heavy deps
  // (SockJS/STOMP, Monaco) during initial bootstrap.
  // PreloadAllModules in app.config ensures they are still fetched
  // immediately in the background, so first navigation is instant.
  { path: 'editor/:id',     loadComponent: () => import('./features/editor/editor').then(m => m.Editor) },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then(m => m.Admin)
  }
];
