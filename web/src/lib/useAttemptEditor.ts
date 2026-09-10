import type { AttemptDto, ChangeImpact, DesignDocument, SubmitResponse } from '@designloop/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';

const AUTOSAVE_DELAY_MS = 1200;

/**
 * Owns the local draft of one attempt and keeps it in sync with the server:
 * edits autosave after a pause, saves never overlap, every save carries the
 * version it is based on, and a conflict (another tab, a locked design) stops
 * saving instead of overwriting.
 */
export function useAttemptEditor(initial: AttemptDto) {
  const [attempt, setAttempt] = useState(initial);
  const [design, setDesignState] = useState(initial.design);
  const [changeImpact, setImpactState] = useState(initial.changeImpact);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const live = useRef({
    attempt: initial,
    design: initial.design,
    changeImpact: initial.changeImpact,
    pending: null as 'design' | 'impact' | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    inFlight: null as Promise<void> | null,
    blocked: false,
  });

  const flush = useCallback(async (): Promise<void> => {
    const state = live.current;
    clearTimeout(state.timer);
    if (state.inFlight) await state.inFlight;
    const kind = state.pending;
    if (!kind || state.blocked) return;
    state.pending = null;
    setSaveState('saving');
    const run = (async () => {
      try {
        const dto =
          kind === 'design'
            ? await api.saveDesign(state.attempt.id, state.design, state.attempt.version)
            : await api.saveChangeImpact(state.attempt.id, state.changeImpact!, state.attempt.version);
        state.attempt = dto;
        setAttempt(dto);
        setSaveState(state.pending ? 'unsaved' : 'saved');
      } catch (error) {
        if (error instanceof ApiError && ['VERSION_CONFLICT', 'DESIGN_LOCKED'].includes(error.code)) {
          state.blocked = true;
          setSaveState('conflict');
        } else {
          state.pending = state.pending ?? kind;
          setSaveState('error');
        }
      }
    })();
    state.inFlight = run;
    await run;
    state.inFlight = null;
    if (state.pending && !state.blocked) await flush();
  }, []);

  const schedule = useCallback(
    (kind: 'design' | 'impact') => {
      const state = live.current;
      state.pending = kind;
      setSaveState('unsaved');
      clearTimeout(state.timer);
      state.timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const updateDesign = useCallback(
    (update: (current: DesignDocument) => DesignDocument) => {
      const next = update(live.current.design);
      live.current.design = next;
      setDesignState(next);
      schedule('design');
    },
    [schedule],
  );

  const updateChangeImpact = useCallback(
    (update: (current: ChangeImpact) => ChangeImpact) => {
      if (!live.current.changeImpact) return;
      const next = update(live.current.changeImpact);
      live.current.changeImpact = next;
      setImpactState(next);
      schedule('impact');
    },
    [schedule],
  );

  const revealCurveball = useCallback(async () => {
    await flush();
    const dto = await api.revealCurveball(live.current.attempt.id);
    live.current.attempt = dto;
    live.current.changeImpact = dto.changeImpact;
    setAttempt(dto);
    setImpactState(dto.changeImpact);
  }, [flush]);

  const submit = useCallback(async (): Promise<SubmitResponse> => {
    await flush();
    return api.submit(live.current.attempt.id);
  }, [flush]);

  useEffect(() => {
    const state = live.current;
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (state.pending || state.inFlight) event.preventDefault();
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => {
      window.removeEventListener('beforeunload', warnIfUnsaved);
      // Leaving the page mid-edit: save what's pending rather than drop it.
      if (state.pending) void flush();
    };
  }, [flush]);

  return { attempt, design, changeImpact, saveState, updateDesign, updateChangeImpact, revealCurveball, submit, flush };
}
