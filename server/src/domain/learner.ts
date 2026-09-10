import { ValidationFailed } from './errors';

const MAX_NAME_LENGTH = 60;

/**
 * A practising learner. Deliberately minimal: a name-only profile so attempts and
 * history have an owner. This is identification, not authentication (out of scope).
 */
export class Learner {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly createdAt: Date,
  ) {}

  static register(params: { id: string; name: string; now: Date }): Learner {
    const name = params.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      throw new ValidationFailed(`Name must be 1–${MAX_NAME_LENGTH} characters.`);
    }
    return new Learner(params.id, name, params.now);
  }

  static restore(params: { id: string; name: string; createdAt: Date }): Learner {
    return new Learner(params.id, params.name, params.createdAt);
  }
}
