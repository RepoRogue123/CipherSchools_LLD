import type { ApiErrorBody } from '@designloop/shared';
import type { ErrorRequestHandler } from 'express';
import type { z } from 'zod';
import type { Logger } from '../application/logger';
import {
  DomainError,
  NotReadyForCurveball,
  NotReadyToSubmit,
  ValidationFailed,
} from '../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  DESIGN_LOCKED: 409,
  NOT_READY_FOR_CURVEBALL: 409,
  NOT_READY_TO_SUBMIT: 409,
  VALIDATION_FAILED: 422,
};

/** Parses a request body or throws a ValidationFailed listing every issue by path. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationFailed(
      'The request body is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`),
    );
  }
  return result.data;
}

function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** The one place where failures become HTTP responses. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (error instanceof DomainError) {
      const body = errorBody(error.code, error.message);
      if (error instanceof NotReadyForCurveball || error instanceof NotReadyToSubmit) {
        body.error.blockers = [...error.blockers];
      }
      if (error instanceof ValidationFailed && error.issues.length > 0) {
        body.error.issues = [...error.issues];
      }
      res.status(STATUS_BY_CODE[error.code] ?? 400).json(body);
      return;
    }
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') {
      res.status(400).json(errorBody('BAD_JSON', 'The request body is not valid JSON.'));
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'The request body is too large.'));
      return;
    }
    logger.error('Unhandled request error', {
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    res.status(500).json(errorBody('INTERNAL', 'Something went wrong. Please try again.'));
  };
}
