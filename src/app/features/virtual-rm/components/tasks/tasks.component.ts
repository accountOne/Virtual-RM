import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Task, TaskPriority } from '../../../../core/models';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

const PRIORITY_DOT: Record<TaskPriority, string> = { HIGH: '🔴', MEDIUM: '🟠', LOW: '🟡' };

@Component({
  selector: 'app-tasks-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, VndPipe],
  template: `
    <div class="card p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-ink-800">📋 Việc cần xử lý</h3>
        <span class="text-xs text-ink-400">{{ tasks.length }} việc</span>
      </div>

      <app-empty-state *ngIf="tasks.length === 0" icon="🎉" title="Không còn việc nào cần xử lý" subtitle="Anh/chị đã xử lý xong mọi việc." />

      <div class="space-y-2.5">
        <div *ngFor="let task of tasks" class="rounded-lg border border-ink-100 p-3.5 flex items-start gap-3">
          <span class="text-base leading-none mt-0.5">{{ priorityDot[task.priority] }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-ink-800">{{ task.title }}</p>
            <p class="text-xs text-ink-500 mt-0.5">{{ task.description }}</p>
            <p class="text-xs text-ink-400 mt-1" *ngIf="task.meta?.amount as amount">{{ amount | vnd }}</p>
            <p class="text-xs text-ink-400 mt-1" *ngIf="!task.meta?.amount">Hạn: {{ task.dueDate }}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <button class="btn-secondary !px-3 !py-1.5 !text-xs" (click)="handle(task)">
              {{ task.actionLabel }}
            </button>
            <button class="text-[11px] text-ink-400 hover:text-positive" (click)="completed.emit(task.id)">
              ✓ Đánh dấu xong
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TasksListComponent {
  @Input() tasks: Task[] = [];
  @Output() completed = new EventEmitter<string>();
  readonly priorityDot = PRIORITY_DOT;

  constructor(private readonly router: Router) {}

  handle(task: Task): void {
    this.router.navigateByUrl(task.actionLink);
  }
}
