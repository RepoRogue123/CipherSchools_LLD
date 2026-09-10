import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../domain/ports';

export const systemClock: Clock = { now: () => new Date() };

export const randomIds: IdGenerator = { next: () => randomUUID() };
