import { Component } from '@angular/core';

@Component({
  selector: 'app-concepts',
  standalone: true,
  imports: [],
  templateUrl: './concepts.component.html',
  styleUrl: './concepts.component.css',
})
export class ConceptsComponent {
  readonly concepts = [
    { icon: '⚡', iconBg: '#FFF1F0', title: 'What is Redis?', body: 'A fast in-memory key-value store used for caching, sessions, OTPs, counters and queues.' },
    { icon: '🗂️', iconBg: '#EAF1FD', title: 'What is a cache?', body: 'A layer that keeps frequently-used data close and fast, so apps avoid slow repeated database reads.' },
    { icon: '⏱️', iconBg: '#FDF3E3', title: 'What is TTL?', body: 'Time To Live — how long a key stays before it is automatically removed from memory.' },
    { icon: '🔑', iconBg: '#E7F6EF', title: 'Key-Value storage', body: 'Data is stored as simple pairs, like name → Priya or otp → 123456. One key, one value.' },
    { icon: '🐘', iconBg: '#F1EDFB', title: 'Redis vs PostgreSQL', body: 'PostgreSQL holds permanent structured data; Redis holds fast, temporary or hot data.' },
  ];
}
