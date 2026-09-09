import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-field',
  standalone: true,
  host: { class: 'block' },
  template: `
    <label class="block">
      <span class="text-xs font-medium text-ink-600 mb-1 block">{{ label }}</span>
      <ng-content></ng-content>
    </label>
  `,
})
export class FieldComponent {
  @Input() label = '';
}
