import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.css',
})
export class ToastContainerComponent {
  constructor(public state: AppStateService) {}
}
