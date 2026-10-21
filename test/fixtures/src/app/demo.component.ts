import { inject } from '@angular/core';
import { DemoFacade } from '@spartacus/demo/root';

export class DemoComponent {
  demoFacade = inject(DemoFacade);

  reload(code: string): void {
    this.demoFacade.load(code, { force: true });
  }
}
