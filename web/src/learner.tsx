import type { LearnerDto } from '@designloop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, api, setLearnerId } from './api/client';

const STORAGE_KEY = 'designloop.learnerId';

interface LearnerContextValue {
  learner: LearnerDto;
  switchLearner: () => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function useLearner(): LearnerContextValue {
  const value = useContext(LearnerContext);
  if (!value) throw new Error('useLearner must be used inside <LearnerGate>');
  return value;
}

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the learner simply isn't remembered on this device
  }
}

/** Resolves who is practising before rendering the app; asks for a name the first time. */
export function LearnerGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [learner, setLearner] = useState<LearnerDto | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = readStoredId();
    if (!stored) {
      setChecking(false);
      return;
    }
    setLearnerId(stored);
    api
      .me()
      .then(setLearner)
      .catch(() => {
        storeId(null);
        setLearnerId(null);
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <p className="p-8 text-ink-soft">Loading…</p>;

  if (!learner) {
    return (
      <NamePrompt
        onReady={(created) => {
          storeId(created.id);
          setLearnerId(created.id);
          setLearner(created);
        }}
      />
    );
  }

  return (
    <LearnerContext.Provider
      value={{
        learner,
        switchLearner: () => {
          storeId(null);
          setLearnerId(null);
          // Drop the previous learner's cached attempts and progress.
          queryClient.clear();
          setLearner(null);
        },
      }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

function NamePrompt({ onReady }: { onReady: (learner: LearnerDto) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onReady(await api.createLearner(name));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the DesignLoop server. Is it running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="mb-3 text-[1.35rem] font-semibold [font-stretch:118%] text-cobalt">DesignLoop</p>
      <h1 className="text-[2rem]">Practise low-level design, then see how it holds up when requirements change.</h1>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <label htmlFor="learner-name" className="block font-medium">
          What should we call you?
        </label>
        <input
          id="learner-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          autoComplete="given-name"
        />
        {error && <p className="text-sm text-pencil">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || name.trim().length === 0}>
          Start practising
        </button>
        <p className="text-sm text-ink-soft">
          Your attempts are kept on this DesignLoop server so you can track progress. No password needed; this
          prototype only identifies you, it doesn’t sign you in.
        </p>
      </form>
    </main>
  );
}
