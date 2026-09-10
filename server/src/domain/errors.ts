import type { Finding } from '@designloop/shared';

/** Base class for rule violations the domain reports; the HTTP layer maps `code` to a status. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFound extends DomainError {
  readonly code = 'NOT_FOUND';
}

export class Forbidden extends DomainError {
  readonly code = 'FORBIDDEN';
}

export class InvalidStateTransition extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
}

export class VersionConflict extends DomainError {
  readonly code = 'VERSION_CONFLICT';
}

export class DesignLocked extends DomainError {
  readonly code = 'DESIGN_LOCKED';

  constructor() {
    super('The core design is locked once the curveball is revealed. Describe changes in the change impact instead.');
  }
}

export class NotReadyForCurveball extends DomainError {
  readonly code = 'NOT_READY_FOR_CURVEBALL';

  constructor(readonly blockers: readonly Finding[]) {
    super('Resolve the blocking structure checks before revealing the curveball.');
  }
}

export class NotReadyToSubmit extends DomainError {
  readonly code = 'NOT_READY_TO_SUBMIT';

  constructor(readonly blockers: readonly Finding[]) {
    super('Resolve the blocking checks before submitting.');
  }
}

export class ValidationFailed extends DomainError {
  readonly code = 'VALIDATION_FAILED';

  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
  }
}
