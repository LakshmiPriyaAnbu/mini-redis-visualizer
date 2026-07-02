import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';
import { DataTypesComponent } from '../data-types/data-types.component';

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [DataTypesComponent],
  templateUrl: './playground.component.html',
  styleUrl: './playground.component.css',
})
export class PlaygroundComponent {
  constructor(public state: AppStateService) {}

  onCmdKey(event: KeyboardEvent) {
    if (event.key === 'Enter') this.state.runCmd();
  }
}
