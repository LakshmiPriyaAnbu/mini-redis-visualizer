import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';

@Component({
  selector: 'app-command-history',
  standalone: true,
  imports: [],
  templateUrl: './command-history.component.html',
  styleUrl: './command-history.component.css',
})
export class CommandHistoryComponent {
  constructor(public state: AppStateService) {}
}
