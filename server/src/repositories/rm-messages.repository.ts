import { JsonSingletonRepository } from './json-file.repository';
import { RmMessages } from '../models';

export const rmMessagesRepository = new JsonSingletonRepository<RmMessages>('rm-messages.json');
