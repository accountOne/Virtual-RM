import { JsonFileRepository } from './json-file.repository';
import { AuditEvent, BankingCommand, CommandSnapshot } from '../models';

export const bankingCommandsRepository = new JsonFileRepository<BankingCommand>('banking-commands.json');
export const commandSnapshotsRepository = new JsonFileRepository<CommandSnapshot>('command-snapshots.json');
export const auditEventsRepository = new JsonFileRepository<AuditEvent>('audit-events.json');
