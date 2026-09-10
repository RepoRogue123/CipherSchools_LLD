# DesignLoop

Practise low-level design the way it is tested in interviews: design a system, then find out how it holds up when the requirements change.

Most LLD practice ends by comparing your design with a reference solution. That tells you your design is *different*, not whether it is *good*. DesignLoop reviews your design against a public rubric instead. Every judgement quotes your own words, and extensibility is tested with a change request you haven't seen.

- **Structured design editor.** Assumptions, entities, relationships, requirement mapping, key flows, edge cases and trade-offs, with structure checks that update as you type.
- **The curveball.** When your design is ready you reveal a change request (for example "add EV charging billed per kWh"). Your core design locks, and you explain which classes you would add and which you would have to edit.
- **Evidence-linked review.** Eight rubric criteria, each scored 1–4 on described levels. Quotes from your design are highlighted, and quotes that can't be found in your submission are flagged. Automated checks cap scores when evidence is plainly missing.
- **A learning loop.** Your next three moves are pinned to the next attempt, which faces the other curveball. Scores by criterion over time, a comparison with the previous attempt, and recurring weak spots across problems.

The research behind these choices is in [docs/RESEARCH.md](docs/RESEARCH.md); the design, domain model and trade-offs are in [docs/DESIGN.md](docs/DESIGN.md).

## Run it

Requires **Node.js 22.13 or newer** (for the built-in `node:sqlite`). There are no native dependencies, database server or Docker.

```bash
npm install
cp .env.example .env      # optional: add a free LLM key to enable AI review (see below)
npm run dev               # API on :4000, web app on http://localhost:5173
```

To run the production build on a single port instead:

```bash
npm start                 # builds the web app, then serves everything on http://localhost:4000
```

The database is a single SQLite file at `server/data/designloop.db`, created on first run. Delete it to start over.

### Enable AI review (free keys)

Without a key the whole loop still works, with automated checks only and the rubric criteria unscored. To get AI review, put one or more free keys in `.env`. Providers are tried in order, and if one is rate limited the next one takes over.

| Provider | Get a free key | Variable |
|---|---|---|
| Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| Groq | https://console.groq.com/keys | `GROQ_API_KEY` |
| OpenRouter (models ending in `:free`) | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |
| Any OpenAI-compatible endpoint (e.g. local Ollama) | n/a | `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_MODEL` |

Check your keys and models:

```bash
npm run smoke:llm                     # one structured call per configured provider
npm run smoke:llm -- --list-models    # also list the model ids your key can use
```

Model ids change often. Override them with `GEMINI_MODEL`, `GROQ_MODEL` or `OPENROUTER_MODEL` if a default is retired.

## A five-minute tour

1. Open http://localhost:5173 and enter a name. This is a profile, not a login.
2. Choose **Parking Lot** and start an attempt. The brief is on the left; open the clarifying questions to see the interviewer's answers.
3. To skip the typing, open the attempt with `?demo` added to the URL, for example `http://localhost:5173/attempts/<id>?demo`, and use **Load the sample design**.
4. Open the checks panel (bottom left) to see blockers and suggestions. When there are no blockers, choose **Reveal the curveball**.
5. Describe the change impact (or load the sample one in demo mode) and **Submit for review**. The page moves from Submitted to Evaluating to Feedback ready.
6. Read the review: highlighted evidence, concerns, suggestions, caps and next moves. Then choose **Revise this design**. Your next moves are pinned and you face the other curveball.
7. The problem page shows your attempts and a per-criterion history table. After a few reviews, recurring weak spots appear on the home page.

## How it's built

A TypeScript monorepo (npm workspaces) with a plain monolith: an Express API, an in-process evaluation worker and SQLite.

```
content/   problems (JSON), rubric v1, example designs
shared/    API contract: Zod schemas and DTO types used by server and web
server/    domain (Attempt, Submission, Evaluation, Rubric…), evaluation engine
           (structural checks, LLM rubric reviewer, evidence verifier, feedback assembler,
           pipeline), application services, SQLite repositories, LLM clients, HTTP API
web/       React + Vite + TanStack Query + Tailwind
docs/      RESEARCH.md, DESIGN.md
```

- Submitting stores the design and queues its evaluation in **one transaction**, then returns `202`. A background worker runs automated checks first, then the AI review. Each step is persisted, so a retry only re-runs what failed.
- AI calls go through **one OpenAI-compatible client** with a **fallback chain** across providers. Rate-limited providers are cooled down, transient failures are retried with backoff, and a failed review still returns the deterministic feedback.
- The AI is given a **fixed rubric with described levels** and must return evidence before scores in a validated JSON shape. There is no overall AI score; the band is computed from the criterion levels.
- `Evaluator` and `DesignFormat` are the extension points: adding a rule-based or human reviewer, or a class-diagram format, doesn't touch the practice flow. See [DESIGN.md §9](docs/DESIGN.md#9-change-tests).

## Tests and checks

```bash
npm test            # server (unit + integration + HTTP) and web component tests
npm run check       # lint, typecheck, test and build: the same steps CI runs
npm run calibrate   # with an AI key: strong vs weak design, repeated runs, score spread
```

The server suite runs against real SQLite (in memory) and a scripted LLM. It covers:

- the attempt and evaluation state machines;
- every structural check and cap;
- evidence verification;
- LLM error classification and fallback;
- idempotent submits, retries with backoff, and recovery after a worker crash;
- the full practice loop over HTTP.

## Limitations

This is a prototype. It has no authentication, runs as a single process, and polls instead of pushing updates. Free-tier providers may use prompts for training. The full list of trade-offs is in [DESIGN.md §11](docs/DESIGN.md#11-trade-offs-and-limitations).
