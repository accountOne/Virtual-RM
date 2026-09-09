import { tasksRepository } from '../repositories';
import { Task } from '../models';

export const tasksService = {
  list(): Task[] {
    return tasksRepository.readAll();
  },
  open(): Task[] {
    return tasksRepository.readAll().filter((t) => t.status === 'OPEN');
  },
  complete(id: string): Task | undefined {
    return tasksRepository.update(id, { status: 'COMPLETED' });
  },
};
