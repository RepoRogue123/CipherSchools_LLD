import { Link } from 'react-router';
import { ApiError } from '../api/client';

export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <p className="px-6 py-10 text-ink-soft" role="status">
      {what}…
    </p>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl">{notFound ? 'We couldn’t find that.' : 'Something went wrong.'}</h1>
      <p className="mt-3 text-ink-soft">
        {notFound
          ? 'It may belong to another learner, or the link is out of date.'
          : error instanceof Error
            ? error.message
            : 'The server could not complete the request.'}
      </p>
      <Link to="/" className="btn btn-secondary mt-6">
        Back to problems
      </Link>
    </div>
  );
}
