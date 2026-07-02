import { Component } from '@angular/core';
import { AppStateService } from '../../core/app-state.service';
import { StoreValueType } from '../../core/models';

@Component({
  selector: 'app-data-types',
  standalone: true,
  imports: [],
  templateUrl: './data-types.component.html',
  styleUrl: './data-types.component.css',
})
export class DataTypesComponent {
  readonly types: StoreValueType[] = ['string', 'list', 'hash', 'set'];

  constructor(public state: AppStateService) {}

  onValueKey(event: KeyboardEvent) {
    if (event.key === 'Enter') this.state.runDt(this.state.dtConfig().defaultOp);
  }
}
