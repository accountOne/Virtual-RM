import { JsonFileRepository } from './json-file.repository';
import { Task } from '../models';

export const tasksRepository = new JsonFileRepository<Task>('tasks.json');
