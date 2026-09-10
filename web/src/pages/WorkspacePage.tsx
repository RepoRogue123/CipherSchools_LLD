import type { AttemptDto, Finding, ProblemBriefDto } from '@designloop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../api/client';
import { ChecksPanel } from '../components/ChecksPanel';
import { ChangeImpactEditor } from '../components/editor/ChangeImpactEditor';
import {
  AssumptionsEditor,
  DecisionsEditor,
  EdgeCasesEditor,
  EntitiesEditor,
  FlowsEditor,
  MappingEditor,
  RelationshipsEditor,
} from '../components/editor/DesignSections';
import { Section } from '../components/editor/Section';
import { ErrorState, Loading } from '../components/States';
import { TitleBlock } from '../components/TitleBlock';
import { exampleFor } from '../lib/examples';
import { formatTime, newId } from '../lib/format';
import { sectionStatus, type SectionId } from '../lib/sections';
import { useAttemptEditor, type SaveState } from '../lib/useAttemptEditor';

export function WorkspacePage() {
  const { attemptId = '' } = useParams();
  const attemptQuery = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api.attempt(attemptId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const problemId = attemptQuery.data?.problemId;
  const briefQuery = useQuery({
    queryKey: ['problem', problemId],
    queryFn: () => api.problem(problemId!),
    enabled: Boolean(problemId),
  });

  if (attemptQuery.error) return <ErrorState error={attemptQuery.error} />;
  if (briefQuery.error) return <ErrorState error={briefQuery.error} />;
  if (!attemptQuery.data || !briefQuery.data) return <Loading what="Opening your attempt" />;
  const attempt = attemptQuery.data;
  if (attempt.status === 'SUBMITTED' && attempt.evaluation) {
    return <Navigate to={`/evaluations/${attempt.evaluation.id}`} replace />;
  }
  return <Workspace key={attempt.id} initial={attempt} brief={briefQuery.data} />;
}

const HINTS: Record<SectionId, string> = {
  assumptions: 'Resolve the ambiguities before designing. Interviewers want to hear what you assumed and what you left out.',
  entities: 'The classes, interfaces and enums in your design. Each needs one clear responsibility.',
  relationships: 'How the entities collaborate. Prefer depending on abstractions where things are likely to change.',
  mapping: 'Trace every requirement to the part of the design that satisfies it.',
  flows: 'Walk through the key use cases step by step, naming the objects and methods involved.',
  edgeCases: 'Failure paths are where designs break. Say which class handles each one.',
  decisions: 'Record the choices that mattered, the alternative you rejected, and why.',
  changeImpact: 'Explain how your locked design handles the change. What plugs in, what is new, what must be edited?',
};

function Workspace({ initial, brief }: { initial: AttemptDto; brief: ProblemBriefDto }) {
  const editor = useAttemptEditor(initial);
  const { attempt, design, changeImpact, saveState } = editor;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checksOpen, setChecksOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justRevealed, setJustRevealed] = useState(false);

  const locked = attempt.status !== 'IN_PROGRESS';
  const findings = attempt.checks.findings;
  const blockers = attempt.checks.blockerCount;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  // Seed the suggested key flows so the learner starts from the problem's main use cases.
  const { updateDesign } = editor;
  useEffect(() => {
    if (initial.status !== 'IN_PROGRESS' || initial.design.flows.length > 0 || brief.keyFlows.length === 0) return;
    updateDesign((d) =>
      d.flows.length > 0 ? d : { ...d, flows: brief.keyFlows.map((name) => ({ id: newId('f'), name, steps: '' })) },
    );
  }, [initial, brief.keyFlows, updateDesign]);

  const goTo = (section: SectionId) => {
    setChecksOpen(false);
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function explain(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
      if (error.blockers.length > 0) setChecksOpen(true);
      return error.message;
    }
    return fallback;
  }

  async function reveal() {
    setBusy(true);
    setActionError(null);
    try {
      await editor.revealCurveball();
      setConfirming(false);
      setJustRevealed(true);
      requestAnimationFrame(() => goTo('changeImpact'));
    } catch (error) {
      setConfirming(false);
      setActionError(explain(error, 'Could not reveal the curveball. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setActionError(null);
    try {
      const result = await editor.submit();
      await queryClient.invalidateQueries();
      navigate(`/evaluations/${result.evaluation.id}`);
    } catch (error) {
      setActionError(explain(error, 'Could not submit. Your design is saved; try again in a moment.'));
      setBusy(false);
    }
  }

  const status = (section: SectionId) => sectionStatus(findings, section);
  const sectionProps = { design, update: editor.updateDesign, locked };
  const example = exampleFor(brief.id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-36 sm:px-6">
      <div className="py-5">
        <TitleBlock
          cells={[
            { label: 'Problem', value: <Link className="link" to={`/problems/${brief.id}`}>{brief.title}</Link>, grow: true },
            { label: 'Attempt', value: `#${attempt.number}` },
            {
              label: 'Stage',
              value: locked
                ? `Design locked at ${formatTime(attempt.curveballRevealedAt!)}`
                : 'Designing',
            },
            { label: 'Started', value: formatTime(attempt.startedAt) },
          ]}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(17rem,22rem)_1fr]">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
          <Brief brief={brief} focusGoals={attempt.focusGoals} />
        </aside>

        <main className="min-w-0 rounded-md border border-rule bg-sheet px-4 sm:px-6">
          {example && (
            <p className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-amber bg-amber-wash px-3 py-2 text-sm text-amber">
              Demo mode: load a complete sample design to try the loop quickly.
              {!locked ? (
                <button type="button" className="btn btn-secondary" onClick={() => editor.updateDesign(() => example.design)}>
                  Load the sample design
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => editor.updateChangeImpact(() => example.changeImpact)}
                >
                  Load the sample change impact
                </button>
              )}
            </p>
          )}
          <Section id="assumptions" number={1} title="Assumptions & scope" hint={HINTS.assumptions} status={status('assumptions')} locked={locked}>
            <AssumptionsEditor {...sectionProps} />
          </Section>
          <Section id="entities" number={2} title="Entities" hint={HINTS.entities} status={status('entities')} locked={locked}>
            <EntitiesEditor {...sectionProps} />
          </Section>
          <Section id="relationships" number={3} title="Relationships" hint={HINTS.relationships} status={status('relationships')} locked={locked}>
            <RelationshipsEditor {...sectionProps} />
          </Section>
          <Section id="mapping" number={4} title="Requirement mapping" hint={HINTS.mapping} status={status('mapping')} locked={locked}>
            <MappingEditor {...sectionProps} brief={brief} />
          </Section>
          <Section id="flows" number={5} title="Key flows" hint={HINTS.flows} status={status('flows')} locked={locked}>
            <FlowsEditor {...sectionProps} />
          </Section>
          <Section id="edgeCases" number={6} title="Edge cases & failure handling" hint={HINTS.edgeCases} status={status('edgeCases')} locked={locked}>
            <EdgeCasesEditor {...sectionProps} />
          </Section>
          <Section id="decisions" number={7} title="Decisions & trade-offs" hint={HINTS.decisions} status={status('decisions')} locked={locked}>
            <DecisionsEditor {...sectionProps} />
          </Section>
          <Section id="changeImpact" number={8} title="Change impact" hint={HINTS.changeImpact} status={locked ? status('changeImpact') : 'ok'}>
            {locked && attempt.curveball && changeImpact ? (
              <div className="space-y-6">
                <CurveballCard curveball={attempt.curveball} lockedAt={attempt.curveballRevealedAt!} animate={justRevealed} />
                <ChangeImpactEditor design={design} impact={changeImpact} update={editor.updateChangeImpact} readOnly={false} />
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-rule-strong px-4 py-5 text-sm text-ink-soft">
                When your design is ready, reveal the curveball: a change request you haven’t seen. Sections 1 to 7 then
                lock, and you explain here how your design absorbs the change. Interviewers test extensibility the same way.
              </p>
            )}
          </Section>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule-strong bg-sheet">
        {checksOpen && (
          <div id="checks-drawer" className="mx-auto max-h-[45vh] max-w-[1400px] overflow-y-auto border-b border-rule px-4 py-4 sm:px-6">
            <ChecksPanel findings={findings} onGoTo={goTo} />
          </div>
        )}
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={checksOpen}
            aria-controls="checks-drawer"
            onClick={() => setChecksOpen((open) => !open)}
          >
            <CheckCounts findings={findings} blockers={blockers} warnings={warnings} />
          </button>
          <SaveIndicator state={saveState} onRetry={() => void editor.flush()} />
          <span className="flex-1" />
          {actionError && <span className="max-w-md text-sm text-pencil" role="alert">{actionError}</span>}
          {blockers > 0 && !actionError && (
            <span className="text-sm text-ink-soft">Fix the {blockers === 1 ? 'blocker' : `${blockers} blockers`} to continue</span>
          )}
          {locked ? (
            <button type="button" className="btn btn-primary" disabled={blockers > 0 || busy || saveState === 'conflict'} onClick={() => void submit()}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={blockers > 0 || busy || saveState === 'conflict'} onClick={() => setConfirming(true)}>
              Reveal the curveball
            </button>
          )}
        </div>
      </div>

      <ConfirmReveal open={confirming} busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void reveal()} />
    </div>
  );
}

function CheckCounts({ findings, blockers, warnings }: { findings: Finding[]; blockers: number; warnings: number }) {
  if (findings.length === 0) return <span className="text-moss">No structural issues</span>;
  return (
    <span className="flex gap-3">
      <span className={blockers > 0 ? 'text-pencil' : 'text-ink-soft'}>
        {blockers} {blockers === 1 ? 'blocker' : 'blockers'}
      </span>
      <span className="text-ink-soft">
        {warnings} {warnings === 1 ? 'suggestion' : 'suggestions'}
      </span>
    </span>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const text: Record<SaveState, string> = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    conflict: 'This attempt changed in another tab.',
    error: 'Couldn’t save your last change.',
  };
  return (
    <span className={`text-sm ${state === 'conflict' || state === 'error' ? 'text-pencil' : 'text-ink-soft'}`} role="status">
      {text[state]}
      {state === 'conflict' && (
        <button type="button" className="link ml-2" onClick={() => window.location.reload()}>
          Reload
        </button>
      )}
      {state === 'error' && (
        <button type="button" className="link ml-2" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
}

function CurveballCard({
  curveball,
  lockedAt,
  animate,
}: {
  curveball: { title: string; description: string };
  lockedAt: string;
  animate: boolean;
}) {
  return (
    <div className={`relative rounded-md border-2 border-ink bg-sheet p-5 pr-28 ${animate ? 'animate-curveball' : ''}`}>
      <h3 className="text-xl">Curveball: {curveball.title}</h3>
      <p className="mt-2 max-w-[68ch]">{curveball.description}</p>
      <span
        className={`absolute right-4 top-4 rotate-[-4deg] rounded border-2 border-pencil px-2 py-0.5 text-center text-xs font-bold leading-tight text-pencil [font-stretch:85%] ${animate ? 'animate-stamp' : ''}`}
      >
        Design locked
        <br />
        {formatTime(lockedAt)}
      </span>
    </div>
  );
}

function ConfirmReveal({ open, busy, onCancel, onConfirm }: { open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={onCancel}
      className="m-auto max-w-lg rounded-lg border border-rule-strong bg-sheet p-6 text-ink backdrop:bg-ink/40"
      aria-labelledby="reveal-title"
    >
      <h2 id="reveal-title" className="text-2xl">
        Reveal the curveball?
      </h2>
      <p className="mt-3">
        You’ll get a change request you haven’t seen yet. Sections 1 to 7 lock, so instead of quietly redesigning, you
        explain what your design would add and what it would have to change.
      </p>
      <p className="mt-2 text-sm text-ink-soft">A design that absorbs change by adding classes, not editing many, scores well on extensibility.</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Keep designing
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? 'Revealing…' : 'Reveal and lock my design'}
        </button>
      </div>
    </dialog>
  );
}

function Brief({ brief, focusGoals }: { brief: ProblemBriefDto; focusGoals: string[] }) {
  return (
    <div className="space-y-6 text-[0.9375rem]">
      {focusGoals.length > 0 && (
        <section className="border-l-2 border-cobalt pl-3" aria-labelledby="focus-title">
          <h2 id="focus-title" className="text-base">
            Focus from your last review
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">
            {focusGoals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="context-title">
        <h2 id="context-title" className="text-base">
          The situation
        </h2>
        <p className="mt-2 text-ink-soft">{brief.context}</p>
      </section>
      <section aria-labelledby="requirements-title">
        <h2 id="requirements-title" className="text-base">
          Requirements
        </h2>
        <ul className="mt-2 space-y-2">
          {brief.requirements.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="w-7 shrink-0 font-semibold text-cobalt">{r.id}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="questions-title">
        <h2 id="questions-title" className="text-base">
          Ask before you design
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Think of your own answer first, then open each question to see the interviewer’s.</p>
        <div className="mt-2 divide-y divide-rule rounded-md border border-rule bg-sheet">
          {brief.clarifyingQuestions.map((q) => (
            <details key={q.question} className="group px-3 py-2">
              <summary className="cursor-pointer font-medium marker:text-ink-faint">{q.question}</summary>
              <p className="mt-1.5 text-ink-soft">{q.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-base">
          Out of scope
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">
          {brief.outOfScope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <p className="text-sm">
        <Link to="/rubric" className="link" target="_blank">
          See how designs are assessed
        </Link>
      </p>
    </div>
  );
}
