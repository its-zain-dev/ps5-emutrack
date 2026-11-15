import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AutomationAndFaq } from './components/automation-and-faq';
import { CompatibilityMatrix } from './components/compatibility-matrix';
import { EmulatorDirectory } from './components/emulator-directory';
import { REPO_CONFIG } from './core/tracker-data';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    MatIconModule,
    CompatibilityMatrix,
    EmulatorDirectory,
    AutomationAndFaq,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly repoConfig = REPO_CONFIG;
}
