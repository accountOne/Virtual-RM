import { alertsRepository } from '../repositories';
import { Alert } from '../models';

export const alertsService = {
  list(): Alert[] {
    return alertsRepository.readAll();
  },
};
