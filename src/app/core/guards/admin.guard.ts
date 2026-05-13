import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Route guard that allows access only to users with the ADMIN role.
 * Non-admins are redirected to /dashboard.
 */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const payload = auth.getTokenPayload();
  if (payload?.role === 'ADMIN') {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
