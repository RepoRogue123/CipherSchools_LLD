import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState } from './components/States';
import { LearnerGate } from './learner';
import { FeedbackPage } from './pages/FeedbackPage';
import { HomePage } from './pages/HomePage';
import { ProblemPage } from './pages/ProblemPage';
import { RubricPage } from './pages/RubricPage';
import { WorkspacePage } from './pages/WorkspacePage';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <ErrorState error={new Error('This page failed to load.')} />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/rubric', element: <RubricPage /> },
      { path: '/problems/:problemId', element: <ProblemPage /> },
      { path: '/attempts/:attemptId', element: <WorkspacePage /> },
      { path: '/evaluations/:evaluationId', element: <FeedbackPage /> },
      { path: '*', element: <ErrorState error={new Error('There is no page at this address.')} /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LearnerGate>
        <RouterProvider router={router} />
      </LearnerGate>
    </QueryClientProvider>
  </StrictMode>,
);
