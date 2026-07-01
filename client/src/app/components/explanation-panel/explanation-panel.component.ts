import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';

@Component({
  selector: 'app-explanation-panel',
  standalone: true,
  imports: [],
  templateUrl: './explanation-panel.component.html',
  styleUrl: './explanation-panel.component.css',
})
export class ExplanationPanelComponent {
  constructor(public state: AppStateService) {}
}
