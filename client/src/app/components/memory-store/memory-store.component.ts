import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';

@Component({
  selector: 'app-memory-store',
  standalone: true,
  imports: [],
  templateUrl: './memory-store.component.html',
  styleUrl: './memory-store.component.css',
})
export class MemoryStoreComponent {
  constructor(public state: AppStateService) {}
}
