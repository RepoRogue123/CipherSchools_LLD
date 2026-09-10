import type { DesignDocument } from '@designloop/shared';
import type { DesignFormat } from '../../domain/design-format';

/**
 * Looks up the adapter for a submission's format. With a single format today,
 * Submission.design is typed as the v1 document; a second format would widen it
 * to a union discriminated by `format` and register another adapter here.
 */
export class DesignFormatRegistry {
  private readonly formats: ReadonlyMap<string, DesignFormat<DesignDocument>>;

  constructor(formats: readonly DesignFormat<DesignDocument>[]) {
    this.formats = new Map(formats.map((format) => [format.id, format]));
  }

  get(id: string): DesignFormat<DesignDocument> {
    const format = this.formats.get(id);
    if (!format) throw new Error(`No design format registered for "${id}"`);
    return format;
  }
}
