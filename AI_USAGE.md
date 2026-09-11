# AI usage

I built DesignLoop with an AI coding assistant as a pair programmer. It searched and summarised the research, proposed design options with trade-offs, wrote code and tests, and drafted the documentation. My part was to set the constraints, choose between options, reject suggestions that didn't fit, and not take anything on the assistant's word. Every behaviour has a test that was written before the code, and the AI features were run against real models before I called them done.

AI appears in the project in two places:

| Where | Which AI | How far it is trusted |
|---|---|---|
| **While building** | An AI coding assistant | Proposals only. I made the decisions, and tests plus live runs had to back them up. |
| **Inside the product** | Free-tier LLMs (Gemini, Groq, OpenRouter) reviewing learners' designs | Their output is a claim to check: a fixed rubric, a validated reply, quotes checked against the submission, and plain-code score caps. |

## Five decisions at a glance

| # | Decision | What the AI suggested | What I did | Evidence |
|---|---|---|---|---|
| 1 | What a learner submits | Four formats; it recommended a structured design plus a "curveball" | **Accepted.** Rejected code-first and free text | Live reviews scored the weak change answer 1–2 on extensibility and the strong ones 3–4 |
| 2 | Which model reviews designs | A single paid commercial API | **Rejected.** Free keys only, several providers as fallback | Gemini ran out of quota and was busy mid-testing; reviews still completed |
| 3 | How far to trust the AI reviewer | Fixed rubric, evidence before score, quote checking, caps | **Accepted**, on the condition that it was checked on a real model | Strong design 4.00 in all 3 runs, weak 1.38–1.50; every quote verified |
| 4 | The assistant's assumptions about model ids and API errors | A hard-coded default model, and standard error codes | **Rejected** once live runs contradicted them | A retired model, a 400 for bad keys, per-model daily quotas; all fixed with tests |
| 5 | How to know it actually works | "All automated tests pass" | **Accepted the suite, and added a manual checklist** with test data for all four problems | The test data was run through the real checks: all four designs came back clean |

---

## 1. What a learner submits

**What the AI suggested.** Four submission formats with trade-offs: free-form markdown, a structured design document, the same document with a **curveball** step, or code checked by hidden tests. It recommended the curveball version. In that version, once the design is ready, a change request the learner hasn't seen appears, the design locks, and the learner explains what the change would edit and what it would add.

**What I did.** I accepted the curveball version and rejected the rest. Code-first needs a sandbox and grades language fluency as much as design. Free text can't be checked mechanically. And without the lock, learners can quietly redesign, so extensibility becomes a claim again.

**Why.** The brief's hardest question is how to give useful feedback when many designs are valid. The curveball answers it with behaviour rather than comparison, which is how interviewers actually probe ("now add EV charging").

**How it held up.** In a live run, the weak design answered the curveball with "add an if statement" and scored 1 on extensibility. The strong designs, which add new classes behind existing interfaces, scored 3 and 4.

## 2. Which model reviews designs

**What the AI suggested.** Its first recommendation was a single paid, commercial LLM API as the reviewer.

**What I did.** I rejected it. I wanted free-tier keys only, with several providers as fallback, so the prototype costs nothing to run and doesn't depend on one vendor staying up.

**What that changed.** One OpenAI-compatible client now covers Gemini, Groq, OpenRouter and local models, and a fallback chain tries them in order. With no key at all, the app still works and gives automated feedback only.

**How it held up.** During live testing, Gemini's free tier returned bursts of **503 "high demand"** and used up the **daily quota** on one model. The chain moved on, and reviews kept completing.

## 3. How far to trust the AI reviewer

**What the AI suggested.** Never ask the model "is this design good?". Instead:
- Use a fixed rubric that describes every score level.
- Require quotes and reasoning *before* each score, in a schema-validated reply.
- Check every quote against the submission.
- Let plain code cap scores when evidence is plainly missing, and derive the overall band from the criteria rather than showing an AI "score out of 100".

**What I did.** I accepted all of it, on the condition that it was proven on a real model, not only on the scripted fake used in tests.

**How it held up.** In a calibration run on the Gemini free tier:
- The strong example design scored **4.00, 4.00, 4.00** and the weak one (a god class, no edge cases) **1.38, 1.50, 1.38**.
- Across repeated runs, a criterion's score changed by at most one level, and only once.
- Every quote matched the submission. In an earlier run, the one quote in 21 that didn't was struck through in the UI, as designed.

## 4. Assumptions the assistant got wrong

**What the AI suggested.** Values baked in from its own knowledge:
- a default model, `gemini-2.5-flash`;
- that a bad API key returns HTTP 401;
- that a 429 means "wait a few seconds".

**What I did.** I treated them as unverified until they ran against real providers, and rejected each one the evidence contradicted:

| The assumption | What live runs showed | What changed |
|---|---|---|
| `gemini-2.5-flash` as the default | Google had retired it for new keys | The default is now `gemini-3.6-flash`, backed by the always-current `gemini-flash-latest`. `npm run smoke:llm -- --list-models` shows what a key can use. |
| A bad key returns 401 | Gemini returns **400** "Please pass a valid API key" | Now classified as an auth failure, so the provider is skipped instead of retried. Covered by a test. |
| A 429 means wait a few seconds | Quotas are **per model, per day**, yet Gemini still suggested retrying in 26 s | `GEMINI_MODEL` accepts a list, so each model is its own fallback entry. A daily-quota 429 pauses that model for an hour. Covered by tests. |

**Why it matters.** None of this showed up in 200+ passing tests, because the tests use a scripted model. It only showed up because the prototype was run against the real services before being called done.

## 5. How to know it actually works

**What the AI suggested.** Its evidence was the automated suite: 210 tests covering state machines, the checks, fallback, idempotent submits, crash recovery, and the full loop over HTTP.

**What I did.** I accepted the suite, and also asked for a manual checklist covering every feature and copy-paste test data for all four problems, so I could test the app by hand the way a learner would.

**How it held up.** Before I used the test data, it was run through the app's real structure checks. All four strong designs came back clean, both before the curveball and after each one. The deliberately weak design produced exactly the warnings the checklist predicts.

---

## How I worked with the assistant

- **Constraints first.** The brief, the grading weights and my non-negotiables went into a written plan, which I approved before any code was written.
- **Options, not answers.** For every decision that shaped the product, I asked for alternatives with trade-offs and a recommendation, then chose.
- **Tests before code.** Each behaviour started as a failing test. Where a UI test was written after its component, it was mutation-checked: the behaviour was removed to confirm the test failed, then restored.
- **Evidence over claims.** Live smoke tests, a crash-recovery drill (killing the server mid-review), a provider-fallback drill, and calibration on a real model.
- **Honest artefacts.** The README screenshots come from a real run reviewed live, not from the scripted reviewer used in tests. Draft sentences claiming work that hadn't actually been done were cut.

## What I'd do differently

- **Run against real models on day one.** Model ids and provider quirks went stale faster than any other part of the code.
- **Start collecting human-scored designs early**, so the AI reviewer's agreement with experienced interviewers can be measured, not just its consistency with itself.
