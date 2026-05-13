import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'codesync-theme';
  
  /** Current theme: 'dark' or 'light' */
  readonly theme = signal<'dark' | 'light'>(this.getStoredTheme());
  
  /** True when dark mode is active */
  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    // Apply theme to DOM whenever it changes
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(this.STORAGE_KEY, t);
    });
  }

  toggle(): void {
    this.theme.set(this.isDark() ? 'light' : 'dark');
  }

  private getStoredTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    // Respect OS preference
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }
}

