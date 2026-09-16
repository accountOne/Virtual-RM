// Maker/Checker BankingCommand REST surface (spec §8). Session/CSRF/rate-limit are already
// applied globally to every /api/* route by app.ts's apiRouter (same inheritance the Gemini
// Agent's own routes documented) — nothing extra to wire here beyond `requireRole` per route
// (routes/index.ts) and the ownership checks below.

import { Request, Response } from 'express';
import { commandsService, CommandActor, CommandNotFoundError, CommandValidationBlockedError, IdempotencyMismatchError, SameMakerCheckerError } from '../services/commands.service';
import { InvalidCommandTransitionError } from '../domain/command-workflow';
import { UnsupportedCommandTypeError } from '../domain/rules/validation-engine';
import { CommandType } from '../models';

const VALID_COMMAND_TYPES: ReadonlySet<CommandType> = new Set(['TRANSFER', 'LC', 'GUARANTEE', 'COLLECTION']);

function actorFrom(req: Request): CommandActor {
  const session = req.session!;
  return { userId: session.userId, displayName: session.displayName, role: session.role };
}

function statusCodeFor(err: unknown): number {
  if (err instanceof CommandNotFoundError) return 404;
  if (err instanceof SameMakerCheckerError) return 403;
  if (err instanceof IdempotencyMismatchError) return 409;
  if (err instanceof InvalidCommandTransitionError) return 409;
  if (err instanceof CommandValidationBlockedError) return 422;
  if (err instanceof UnsupportedCommandTypeError) return 400;
  return 500;
}

function handleError(res: Response, err: unknown): void {
  const status = statusCodeFor(err);
  const message = err instanceof Error ? err.message : 'Unexpected error';
  res.status(status).json({ message });
}

/** A Maker may only act on their own DRAFT commands — an ADMIN may act on any. Checker routes
 * have their own, separate ownership rule (must NOT be the maker) enforced inside the service. */
function assertOwnedByMaker(command: { makerUserId: string }, actor: CommandActor): void {
  if (actor.role === 'ADMIN') return;
  if (command.makerUserId !== actor.userId) throw new CommandNotFoundError('(not owned by caller)');
}

export const commandsController = {
  create(req: Request, res: Response) {
    const { commandType, formData, semanticData } = req.body ?? {};
    if (typeof commandType !== 'string' || !VALID_COMMAND_TYPES.has(commandType as CommandType)) {
      return res.status(400).json({ message: 'commandType không hợp lệ.' });
    }
    if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
      return res.status(400).json({ message: 'formData là bắt buộc.' });
    }
    const command = commandsService.createDraft(actorFrom(req), commandType as CommandType, formData, semanticData);
    res.status(201).json(command);
  },

  list(req: Request, res: Response) {
    res.json(commandsService.listForMaker(actorFrom(req)));
  },

  get(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      assertOwnedByMaker(command, actorFrom(req));
      res.json(command);
    } catch (err) {
      handleError(res, err);
    }
  },

  validate(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      assertOwnedByMaker(command, actorFrom(req));
      res.json(commandsService.revalidate(command));
    } catch (err) {
      handleError(res, err);
    }
  },

  updateDraft(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      const actor = actorFrom(req);
      assertOwnedByMaker(command, actor);
      const { formData } = req.body ?? {};
      if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
        return res.status(400).json({ message: 'formData là bắt buộc.' });
      }
      res.json(commandsService.updateDraft(command, actor, formData));
    } catch (err) {
      handleError(res, err);
    }
  },

  submit(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      const actor = actorFrom(req);
      assertOwnedByMaker(command, actor);
      res.json(commandsService.submit(command, actor));
    } catch (err) {
      handleError(res, err);
    }
  },

  // ---- Checker surface ---------------------------------------------------------------------

  checkerList(req: Request, res: Response) {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(commandsService.listForChecker(status as never));
  },

  checkerGet(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      commandsService.recordCheckerView(command, actorFrom(req));
      res.json(command);
    } catch (err) {
      handleError(res, err);
    }
  },

  approve(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      const { idempotencyKey } = req.body ?? {};
      if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
        return res.status(400).json({ message: 'idempotencyKey là bắt buộc.' });
      }
      res.json(commandsService.approve(command, actorFrom(req), idempotencyKey));
    } catch (err) {
      handleError(res, err);
    }
  },

  reject(req: Request, res: Response) {
    try {
      const command = commandsService.getById(req.params.id);
      const { reason } = req.body ?? {};
      if (typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'Lý do từ chối là bắt buộc.' });
      }
      res.json(commandsService.reject(command, actorFrom(req), reason));
    } catch (err) {
      handleError(res, err);
    }
  },
};
