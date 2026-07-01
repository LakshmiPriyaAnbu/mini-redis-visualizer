import { Component } from '@angular/core';

@Component({
  selector: 'app-architecture',
  standalone: true,
  imports: [],
  templateUrl: './architecture.component.html',
  styleUrl: './architecture.component.css',
})
export class ArchitectureComponent {
  readonly steps = [
    { n: '1', title: 'User Input', desc: 'A form entry or a typed command kicks things off.' },
    { n: '2', title: 'API + Parser', desc: 'Express receives the request and parses the command into an action.' },
    { n: '3', title: 'Map Store', desc: 'The key-value pair is written to a JavaScript Map — O(1) access.' },
    { n: '4', title: 'TTL Manager', desc: 'Expiry timestamps are tracked and counted down every second.' },
    { n: '5', title: 'UI Refresh', desc: 'The live memory view re-renders so you see state change instantly.' },
  ];
}
