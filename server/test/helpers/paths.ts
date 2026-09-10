import { fileURLToPath } from 'node:url';

/** Repository-level content directory (problems + rubric) used by tests. */
export const CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));
