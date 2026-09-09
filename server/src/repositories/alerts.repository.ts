import { JsonFileRepository } from './json-file.repository';
import { Alert } from '../models';

export const alertsRepository = new JsonFileRepository<Alert>('alerts.json');
