import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('codesync-frontend');

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
