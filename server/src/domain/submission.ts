import { STRUCTURED_DESIGN_V1, type ChangeImpact, type DesignDocument } from '@designloop/shared';
import { canonicalJson, deepFreeze, sha256 } from './support';

export type SubmissionFormat = typeof STRUCTURED_DESIGN_V1;

export interface SubmissionSnapshot {
  id: string;
  attemptId: string;
  learnerId: string;
  problemId: string;
  curveballId: string;
  format: SubmissionFormat;
  design: DesignDocument;
  changeImpact: ChangeImpact;
  contentHash: string;
  submittedAt: Date;
}

/**
 * The immutable snapshot an evaluation runs against. Freezing it guarantees that
 * feedback always refers to exactly what the learner submitted, even on retries.
 */
export class Submission {
  readonly id: string;
  readonly attemptId: string;
  readonly learnerId: string;
  readonly problemId: string;
  readonly curveballId: string;
  readonly format: SubmissionFormat;
  readonly design: Readonly<DesignDocument>;
  readonly changeImpact: Readonly<ChangeImpact>;
  readonly contentHash: string;
  readonly submittedAt: Date;

  private constructor(snapshot: SubmissionSnapshot) {
    this.id = snapshot.id;
    this.attemptId = snapshot.attemptId;
    this.learnerId = snapshot.learnerId;
    this.problemId = snapshot.problemId;
    this.curveballId = snapshot.curveballId;
    this.format = snapshot.format;
    this.design = deepFreeze(structuredClone(snapshot.design));
    this.changeImpact = deepFreeze(structuredClone(snapshot.changeImpact));
    this.contentHash = snapshot.contentHash;
    this.submittedAt = new Date(snapshot.submittedAt);
    Object.freeze(this);
  }

  static create(params: Omit<SubmissionSnapshot, 'format' | 'contentHash'>): Submission {
    const format = STRUCTURED_DESIGN_V1;
    const contentHash = sha256(
      canonicalJson({
        format,
        curveballId: params.curveballId,
        design: params.design,
        changeImpact: params.changeImpact,
      }),
    );
    return new Submission({ ...params, format, contentHash });
  }

  static restore(snapshot: SubmissionSnapshot): Submission {
    return new Submission(snapshot);
  }
}
