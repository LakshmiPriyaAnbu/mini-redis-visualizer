import { Component } from '@angular/core';
import { HeaderComponent } from './components/header/header.component';
import { HeroComponent } from './components/hero/hero.component';
import { PlaygroundComponent } from './components/playground/playground.component';
import { ExplanationPanelComponent } from './components/explanation-panel/explanation-panel.component';
import { MemoryStoreComponent } from './components/memory-store/memory-store.component';
import { CommandHistoryComponent } from './components/command-history/command-history.component';
import { ArchitectureComponent } from './components/architecture/architecture.component';
import { ConceptsComponent } from './components/concepts/concepts.component';
import { FooterComponent } from './components/footer/footer.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    HeroComponent,
    PlaygroundComponent,
    ExplanationPanelComponent,
    MemoryStoreComponent,
    CommandHistoryComponent,
    ArchitectureComponent,
    ConceptsComponent,
    FooterComponent,
    ToastContainerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
