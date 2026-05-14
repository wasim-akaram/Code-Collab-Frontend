import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('codesync-frontend');

  // Eagerly initialize ThemeService so the stored theme is applied to the DOM
  // before any child component renders — prevents flash of wrong theme.
  private readonly themeService = inject(ThemeService);

  ngOnInit() {
    // Eagerly preload the two heavy lazy-loaded chunks (Editor + Admin)
    // so the first navigation to /editor/:id or /admin is instant.
    // PreloadAllModules only covers loadChildren routes, not loadComponent.
    setTimeout(() => {
      import('./features/editor/editor');
      import('./features/admin/admin');
    }, 500);
  }
}
