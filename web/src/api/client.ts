import type {
  ApiErrorBody,
  AttemptDto,
  AttemptHistoryItemDto,
  ChangeImpact,
  ComparisonDto,
  DesignDocument,
  EvaluationDto,
  Finding,
  HealthDto,
  LearnerDto,
  ProblemBriefDto,
  ProblemSummaryDto,
  ProgressDto,
  RubricDto,
  StartAttemptResponse,
  SubmitResponse,
} from '@designloop/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly blockers: Finding[] = [],
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

let learnerId: string | null = null;

/** The learner id travels in a header; identification only (the prototype has no authentication). */
export function setLearnerId(id: string | null): void {
  learnerId = id;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(learnerId ? { 'x-learner-id': learnerId } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      data?.error.code ?? `HTTP_${response.status}`,
      data?.error.message ?? 'The server could not complete the request.',
      data?.error.blockers ?? [],
      data?.error.issues ?? [],
    );
  }
  return (await response.json()) as T;
}

export const api = {
  createLearner: (name: string) => request<LearnerDto>('POST', '/learners', { name }),
  me: () => request<LearnerDto>('GET', '/learners/me'),
  health: () => request<HealthDto>('GET', '/health'),
  rubric: () => request<RubricDto>('GET', '/rubric'),
  progress: () => request<ProgressDto>('GET', '/me/progress'),
  problems: () => request<ProblemSummaryDto[]>('GET', '/problems'),
  problem: (id: string) => request<ProblemBriefDto>('GET', `/problems/${id}`),
  history: (problemId: string) => request<AttemptHistoryItemDto[]>('GET', `/problems/${problemId}/attempts`),
  startAttempt: (problemId: string, seedFromAttemptId: string | null) =>
    request<StartAttemptResponse>('POST', `/problems/${problemId}/attempts`, { seedFromAttemptId }),
  attempt: (id: string) => request<AttemptDto>('GET', `/attempts/${id}`),
  saveDesign: (id: string, design: DesignDocument, version: number) =>
    request<AttemptDto>('PUT', `/attempts/${id}/design`, { design, version }),
  revealCurveball: (id: string) => request<AttemptDto>('POST', `/attempts/${id}/curveball`),
  saveChangeImpact: (id: string, changeImpact: ChangeImpact, version: number) =>
    request<AttemptDto>('PUT', `/attempts/${id}/change-impact`, { changeImpact, version }),
  submit: (id: string) => request<SubmitResponse>('POST', `/attempts/${id}/submit`),
  comparison: (attemptId: string) =>
    request<{ comparison: ComparisonDto | null }>('GET', `/attempts/${attemptId}/comparison`),
  evaluation: (id: string) => request<EvaluationDto>('GET', `/evaluations/${id}`),
  retryEvaluation: (id: string) => request<EvaluationDto>('POST', `/evaluations/${id}/retry`),
};
