import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Navbar } from '../../shared/navbar/navbar';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, Navbar],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing {
  private router = inject(Router);

  quickSignup(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    
    // In a real app we might pass this email via state to the register page.
    this.router.navigate(['/register'], { state: { email } });
  }

  features = [
    {
      icon: 'users',
      title: 'Real-time collab',
      description: 'Code together with live cursors and presence — see teammates type, character by character.'
    },
    {
      icon: 'play',
      title: 'Run 40+ languages',
      description: 'Execute Python, JS, Java, C++, Go, Rust and more in seconds. No setup, no installs.'
    },
    {
      icon: 'git',
      title: 'Snapshots & diffs',
      description: 'Lightweight Git-style commits with line-by-line Myers diffs and one-click restore.'
    },
    {
      icon: 'comment',
      title: 'Inline reviews',
      description: 'Threaded comments anchored to specific lines and snapshots for async code review.'
    },
    {
      icon: 'globe',
      title: 'Public or private',
      description: 'Ship a public showcase or keep work locked down. Star, fork, and remix anything you can see.'
    },
    {
      icon: 'lock',
      title: 'Secure by default',
      description: 'Row-level security on every project. Granular roles for owners, editors, and viewers.'
    }
  ];
}
