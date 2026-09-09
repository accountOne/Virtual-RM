import { JsonFileRepository } from './json-file.repository';
import { Recommendation } from '../models';

export const recommendationsRepository = new JsonFileRepository<Recommendation>('recommendations.json');
