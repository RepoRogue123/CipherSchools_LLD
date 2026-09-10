import {
  createLearnerRequestSchema,
  saveChangeImpactRequestSchema,
  saveDesignRequestSchema,
  startAttemptRequestSchema,
} from '@designloop/shared';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Container } from '../container';
import { NotFound } from '../domain/errors';
import { parseBody } from './errors';
import {
  toAttemptDto,
  toBriefDto,
  toEvaluationDto,
  toLearnerDto,
  toRubricDto,
  toSubmitResponse,
} from './presenters';

/**
 * Identifies (not authenticates) the learner from the X-Learner-Id header.
 * Authentication is out of scope for the prototype.
 */
function requireLearner(container: Container): RequestHandler {
  return (req, res, next) => {
    const id = req.header('x-learner-id');
    if (!id) {
      res.status(401).json({ error: { code: 'LEARNER_REQUIRED', message: 'Send your learner id in the X-Learner-Id header.' } });
      return;
    }
    try {
      res.locals.learnerId = container.practice.getLearner(id).id;
      next();
    } catch (error) {
      if (!(error instanceof NotFound)) throw error;
      res.status(401).json({ error: { code: 'UNKNOWN_LEARNER', message: 'Unknown learner. Create a profile first.' } });
    }
  };
}

const learnerOf = (res: Response): string => res.locals.learnerId as string;

/** A single named route parameter (Express 5 types params as string | string[] for wildcards). */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) throw new NotFound('Not found.');
  return value;
}

export function apiRouter(c: Container): Router {
  const router = Router();
  const learner = requireLearner(c);

  router.get('/health', (_req, res) => {
    res.json(c.health());
  });

  router.get('/rubric', (_req, res) => {
    res.json(toRubricDto(c.rubric));
  });

  router.post('/learners', (req, res) => {
    const { name } = parseBody(createLearnerRequestSchema, req.body);
    res.status(201).json(toLearnerDto(c.practice.registerLearner(name)));
  });

  router.get('/learners/me', learner, (_req, res) => {
    res.json(toLearnerDto(c.practice.getLearner(learnerOf(res))));
  });

  router.get('/me/progress', learner, (_req, res) => {
    res.json(c.progress.progress(learnerOf(res)));
  });

  router.get('/problems', learner, (_req, res) => {
    res.json(c.progress.problemSummaries(learnerOf(res)));
  });

  router.get('/problems/:problemId', learner, (req, res) => {
    const problem = c.catalog.get(param(req, 'problemId'));
    if (!problem) throw new NotFound('Problem not found.');
    res.json(toBriefDto(problem));
  });

  router.get('/problems/:problemId/attempts', learner, (req, res) => {
    res.json(c.progress.problemHistory(learnerOf(res), param(req, 'problemId')));
  });

  router.post('/problems/:problemId/attempts', learner, (req, res) => {
    const body = parseBody(startAttemptRequestSchema, req.body ?? {});
    const { view, resumed } = c.practice.startAttempt(learnerOf(res), param(req, 'problemId'), body.seedFromAttemptId ?? null);
    res.status(resumed ? 200 : 201).json({ attempt: toAttemptDto(view), resumed });
  });

  router.get('/attempts/:attemptId', learner, (req, res) => {
    res.json(toAttemptDto(c.practice.getAttempt(learnerOf(res), param(req, 'attemptId'))));
  });

  router.put('/attempts/:attemptId/design', learner, (req, res) => {
    const body = parseBody(saveDesignRequestSchema, req.body);
    res.json(toAttemptDto(c.practice.saveDesign(learnerOf(res), param(req, 'attemptId'), body.design, body.version)));
  });

  router.post('/attempts/:attemptId/curveball', learner, (req, res) => {
    res.json(toAttemptDto(c.practice.revealCurveball(learnerOf(res), param(req, 'attemptId'))));
  });

  router.put('/attempts/:attemptId/change-impact', learner, (req, res) => {
    const body = parseBody(saveChangeImpactRequestSchema, req.body);
    res.json(
      toAttemptDto(c.practice.saveChangeImpact(learnerOf(res), param(req, 'attemptId'), body.changeImpact, body.version)),
    );
  });

  router.post('/attempts/:attemptId/submit', learner, (req, res) => {
    const result = c.practice.submit(learnerOf(res), param(req, 'attemptId'));
    // 202: accepted for asynchronous evaluation; 200: duplicate request, original result returned.
    res.status(result.created ? 202 : 200).json(toSubmitResponse(result));
  });

  router.get('/attempts/:attemptId/comparison', learner, (req, res) => {
    res.json({ comparison: c.progress.compare(learnerOf(res), param(req, 'attemptId')) });
  });

  router.get('/evaluations/:evaluationId', learner, (req, res) => {
    res.json(toEvaluationDto(c.practice.getEvaluation(learnerOf(res), param(req, 'evaluationId'))));
  });

  router.post('/evaluations/:evaluationId/retry', learner, (req, res) => {
    res.status(202).json(toEvaluationDto(c.practice.retryEvaluation(learnerOf(res), param(req, 'evaluationId'))));
  });

  return router;
}
