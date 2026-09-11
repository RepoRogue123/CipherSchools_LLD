# AI usage

I built DesignLoop with an AI coding assistant as a pair programmer. The research was mine: I studied how learners practise LLD, compared the existing tools, and read the work on using LLMs as judges. From that research I proposed the design and weighed the options with the assistant's input, accepting some of its suggestions and rejecting others. The AI assistant then helped me with coding and testing. My part was to set the constraints, choose between options, reject suggestions that didn't fit, and not take anything on the assistant's word. Every behaviour has a test that was written before the code, and the AI features were run against real models before I called them done.

The research came first. Before any code, I wrote a note on why low-level design (LLD) practice is hard to evaluate, what existing tools do about it, and where a small product could do better. It is summarised in the next section, and each of the five decisions after it points back to the gap it answers.

AI appears in the project in two places:

| Where | Which AI | How far it is trusted |
|---|---|---|
| **While building** | An AI coding assistant | Proposals only. I made the decisions, and tests plus live runs had to back them up. |
| **Inside the product** | Free-tier LLMs (Gemini, Groq, OpenRouter) reviewing learners' designs | Their output is a claim to check: a fixed rubric, a validated reply, quotes checked against the submission, and plain-code score caps. |

---

## Research before the build

### The learner problem

Most learners practise LLD the same way: pick a classic problem (parking lot, elevator, vending machine), sketch classes, then compare the result with a reference solution from a blog, a repo or a video.

That last step is where it breaks. A reference solution tells you your design is **different**, not whether it is **worse**. One vending machine uses the State pattern, another uses an enum with a transition table, and both are defensible. Learners either decide they are wrong when they are only different, or that they are right because their class names match.

To improve on the next attempt, a learner needs three things:

- **Judgement of qualities, not of shape.** Are responsibilities clear, is change absorbed cheaply, are trade-offs understood?
- **Evidence.** Which part of their design caused each judgement.
- **Memory.** What they keep getting wrong across attempts.

So the platform has to keep the exact design that was reviewed (so feedback can quote it), per-criterion scores over time, and what changed between attempts.

These three needs line up with Hattie and Timperley's model of useful feedback, which asks *where am I going*, *how am I going* and *where to next* [P1]. In DesignLoop those become the published rubric, the quoted evidence, and the next moves pinned to the following attempt.

### Existing tools I compared

| Tool | What you submit | How feedback works | What's missing for this brief |
|---|---|---|---|
| AlgoMaster LLD practice [T1] | Code | Hidden tests gate, then an AI reviewer scores against a rubric published before you start | Code-first, so it measures language fluency as much as design; no unseen change request |
| Hello Interview Guided Practice [T2] | Whiteboard and text, step by step | Instant rubric-based AI coaching per interview step | Built mainly for high-level design; step scores are opaque |
| LowLevelDesignMastery (Show HN) [T3] | UML diagram, then code | AI review of the code; XP and levels | Reviews the code, not the reasoning behind the design |
| workat.tech machine coding [T4] | Working code, reviewed by an interviewer | Criteria include "accommodate new requirements with minimal changes" | No self-serve feedback |
| Static repos, blogs, videos | Nothing | A static reference answer | "Different from the reference" is not "wrong" |
| A general chat assistant | A pasted design | "Is this good?" gives unconstrained, lenient answers that vary run to run | The anti-pattern the brief warns about |

What the better tools get right: they publish the rubric up front, and they split the work into steps that mirror the interview. What interviewers consistently test, and none of the self-serve tools simulate, is how a design absorbs a requirement it wasn't built for ("now add EV charging").

### Repositories I went through

**LLD practice material.** These are where most learners get their reference answers, which is exactly the "compare with a reference" habit the product tries to replace.

| Repository | What it is | What it showed me |
|---|---|---|
| [ashishps1/awesome-low-level-design][R1] | Curated LLD problems with solutions in several languages | The standard problem set (parking lot, elevator, vending machine) and how much valid solutions differ from each other |
| [prasadgujar/low-level-design-primer][R2] | Primer on OOP, SOLID and design patterns, with case studies | The concepts learners are told to apply, usually without any way to check they applied them well |
| [tssovi/grokking-the-object-oriented-design-interview][R3] | Worked OOD interview case studies | Solutions presented as one answer per problem, with little discussion of alternatives or trade-offs |
| [iluwatar/java-design-patterns][R4] | Large catalogue of pattern implementations | Patterns shown in isolation, which is why DesignLoop's rubric judges where an abstraction sits in *this* problem rather than whether a named pattern appears |
| [donnemartin/system-design-primer][R5] | The best-known high-level design resource | Useful as a contrast: HLD has a mature self-study resource, LLD mostly has answer banks |

**LLM-as-a-judge implementations.** These are the reference code behind the papers the reviewer is built on.

| Repository | What it is | What it showed me |
|---|---|---|
| [lm-sys/FastChat, `llm_judge`][R6] | MT-Bench judging code from Zheng et al. | Single-answer grading and pairwise comparison as two separate modes, and the prompt structure for each |
| [nlpyang/geval][R7] | G-Eval code from Liu et al. | Evaluation steps written out before the score is produced |
| [prometheus-eval/prometheus-eval][R8] | Prometheus evaluator models and prompts | Rubrics with a written description for every score level, passed to the judge alongside the answer |

### Research on LLMs as judges, and on rubrics

| Paper | Finding | Where it shows up in DesignLoop |
|---|---|---|
| Zheng et al., 2023, *Judging LLM-as-a-Judge* [P2] | Strong LLM judges can agree with humans well, but show position bias, verbosity bias and self-enhancement, and can give confident reasoning that isn't grounded in the answer | Every quote is checked against the submission; plain-code caps bound scores when evidence is missing; no "score out of 100" |
| Wang et al., 2023, *Large Language Models are not Fair Evaluators* [P3] | In pairwise comparison, simply swapping the order of the two answers can flip the verdict | DesignLoop never compares a design with a reference answer; each design is graded on its own against the rubric |
| Liu et al., 2023, *G-Eval* [P4] | Having the model write out evaluation steps before scoring improves agreement with human judgement | The reply schema requires evidence and reasoning *before* each score |
| Kim et al., 2023, *Prometheus* [P5] | Fine-grained evaluation works much better when the rubric describes each score level, not just the criterion | 8 criteria, each with a written description of what 1, 2, 3 and 4 look like |
| Kim et al., 2024, *Prometheus 2* [P6] | An open evaluator model can follow custom rubrics for direct scoring | A candidate reviewer for the local-model path the client already supports |
| Chiang and Lee, 2023, *Can LLMs Be an Alternative to Human Evaluations?* [P7] | LLM ratings can track expert ratings, but agreement has to be measured, not assumed | The open question on agreement with two experienced interviewers |
| Jonsson and Svingby, 2007, *The use of scoring rubrics* [P8] | Analytic, topic-specific rubrics make scoring more reliable, and sharing them with learners makes expectations clear | The rubric is public before the learner starts, and per-problem reviewer notes say what varies in each problem |

### Gaps, and the mechanism that answers each

| Gap | DesignLoop's answer | Decision |
|---|---|---|
| No judgement of quality: comparison with a reference judges shape, not qualities | A public rubric with every level described; no reference answer; per-problem reviewer notes | 3 |
| Feedback without evidence: generic advice like "consider SOLID" | Every judgement quotes the design, and each quote is checked before it is shown | 3 |
| Extensibility is claimed, not tested | The curveball: an unseen change request, with the design locked | 1 |
| No trade-off practice | A required decisions section (decision, alternative, rationale), with a score cap when it's missing | 1, 3 |
| No memory: each attempt is a one-off | Attempt history, per-criterion comparison with the last attempt, recurring weak criteria, next moves pinned to the next attempt | 1 |
| The judge itself is unreliable: inconsistent scores on vague criteria, verbosity bias, ungrounded justifications [P2] | Rubric levels, evidence before score, schema validation, quote checks, plain-code caps | 2, 3 |

---

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

**Research behind it.** The tool comparison showed that the code-first platforms (AlgoMaster, LowLevelDesignMastery) end up reviewing code, and that the one thing interviewers test that no self-serve tool simulates is an unseen change request; workat.tech lists "accommodate new requirements with minimal changes" as an explicit criterion. The structured document (assumptions, entities with responsibilities, relationships, requirement mapping, key flows, edge cases, decisions, change impact) is the smallest format where every rubric criterion has something to quote. A class diagram shows *what* but not *why*, so it is left as a second format for later.

**Why.** The brief's hardest question is how to give useful feedback when many designs are valid. The curveball answers it with behaviour rather than comparison, which is how interviewers actually probe ("now add EV charging").

**How it held up.** In a live run, the weak design answered the curveball with "add an if statement" and scored 1 on extensibility. The strong designs, which add new classes behind existing interfaces, scored 3 and 4.

## 2. Which model reviews designs

**What the AI suggested.** Its first recommendation was a single paid, commercial LLM API as the reviewer.

**What I did.** I rejected it. I wanted free-tier keys only, with several providers as fallback, so the prototype costs nothing to run and doesn't depend on one vendor staying up.

**Research behind it.** The judge papers put most of the reliability in the process around the model: rubric levels [P5], reasoning before the score [P4], and checks on what the model claims [P2]. With those in place, the choice of model matters less, which made free tiers a reasonable bet rather than a compromise. Prometheus 2 [P6] also showed that open evaluator models are an option, so the client was built to accept local models too.

**What that changed.** One OpenAI-compatible client now covers Gemini, Groq, OpenRouter and local models, and a fallback chain tries them in order. With no key at all, the app still works and gives automated feedback only.

**How it held up.** During live testing, Gemini's free tier returned bursts of **503 "high demand"** and used up the **daily quota** on one model. The chain moved on, and reviews kept completing.

## 3. How far to trust the AI reviewer

**What the AI suggested.** Never ask the model "is this design good?". Instead:
- Use a fixed rubric that describes every score level.
- Require quotes and reasoning *before* each score, in a schema-validated reply.
- Check every quote against the submission.
- Let plain code cap scores when evidence is plainly missing, and derive the overall band from the criteria rather than showing an AI "score out of 100".

**What I did.** I accepted all of it, on the condition that it was proven on a real model, not only on the scripted fake used in tests.

**Research behind it.** Each rule maps to a finding:

| Rule | Source |
|---|---|
| Every score level described in the rubric | Prometheus [P5]; analytic rubrics are more reliable [P8] |
| Evidence and reasoning before the score | G-Eval [P4] |
| Each design graded on its own, never against a reference | Position bias in pairwise judging [P3] |
| Quotes checked against the submission | Confident but ungrounded justifications [P2] |
| Plain-code caps, no single overall AI score | Inconsistent scores on vague criteria [P2] |

Structure, traceability and consistency are facts, so plain code checks them instantly on every save. The model only judges quality.

**How it held up.** In a calibration run on the Gemini free tier:
- The strong example design scored **4.00, 4.00, 4.00** and the weak one (a god class, no edge cases) **1.38, 1.50, 1.38**.
- Across repeated runs, a criterion's score changed by at most one level, and only once.
- Every quote matched the submission. In an earlier run, the one quote in 21 that didn't was struck through in the UI, as designed.

**What it doesn't solve.** Verbosity bias [P2] is reduced by the caps and the quote checks, but not removed: a long design with many quotable lines may still be favoured. That is one reason for the human-agreement study below.

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

- **Research before code.** The problem, the existing tools and the judge literature went into a written note before anything was built.
- **Constraints first.** The brief, the grading weights and my non-negotiables went into a written plan, which I approved before any code was written.
- **Options, not answers.** For every decision that shaped the product, I asked for alternatives with trade-offs and a recommendation, then chose.
- **Tests before code.** Each behaviour started as a failing test. Where a UI test was written after its component, it was mutation-checked: the behaviour was removed to confirm the test failed, then restored.
- **Evidence over claims.** Live smoke tests, a crash-recovery drill (killing the server mid-review), a provider-fallback drill, and calibration on a real model.
- **Honest artefacts.** The README screenshots come from a real run reviewed live, not from the scripted reviewer used in tests. Draft sentences claiming work that hadn't actually been done were cut.

## Open questions for the next round

- **Do learners read the evidence?** Watch learners use it with a timer, and see whether they read the quotes or skip to the score.
- **Does the reviewer agree with humans?** Have two experienced interviewers score the same ten designs and measure agreement with the AI reviewer, as Chiang and Lee did for their task [P7]. So far only consistency with itself has been measured.
- **Does the curveball teach, or over-train?** Check whether the rotating curveball leads to better extension points on the second attempt, or to over-engineering.

## What I'd do differently

- **Run against real models on day one.** Model ids and provider quirks went stale faster than any other part of the code.
- **Start collecting human-scored designs early**, so the AI reviewer's agreement with experienced interviewers can be measured, not just its consistency with itself.

---

## References

### Papers

- **[P1]** Hattie, J. and Timperley, H. (2007). The Power of Feedback. *Review of Educational Research*, 77(1), 81–112. https://doi.org/10.3102/003465430298487
- **[P2]** Zheng, L. et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. https://arxiv.org/abs/2306.05685
- **[P3]** Wang, P. et al. (2023). Large Language Models are not Fair Evaluators. https://arxiv.org/abs/2305.17926
- **[P4]** Liu, Y. et al. (2023). G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment. https://arxiv.org/abs/2303.16634
- **[P5]** Kim, S. et al. (2023). Prometheus: Inducing Fine-grained Evaluation Capability in Language Models. https://arxiv.org/abs/2310.08491
- **[P6]** Kim, S. et al. (2024). Prometheus 2: An Open Source Language Model Specialized in Evaluating Other Language Models. https://arxiv.org/abs/2405.01535
- **[P7]** Chiang, C.-H. and Lee, H.-y. (2023). Can Large Language Models Be an Alternative to Human Evaluations? https://arxiv.org/abs/2305.01937
- **[P8]** Jonsson, A. and Svingby, G. (2007). The use of scoring rubrics: Reliability, validity and educational consequences. *Educational Research Review*, 2(2), 130–144. https://doi.org/10.1016/j.edurev.2007.05.002

### Repositories

- **[R1]** ashishps1/awesome-low-level-design: https://github.com/ashishps1/awesome-low-level-design
- **[R2]** prasadgujar/low-level-design-primer: https://github.com/prasadgujar/low-level-design-primer
- **[R3]** tssovi/grokking-the-object-oriented-design-interview: https://github.com/tssovi/grokking-the-object-oriented-design-interview
- **[R4]** iluwatar/java-design-patterns: https://github.com/iluwatar/java-design-patterns
- **[R5]** donnemartin/system-design-primer: https://github.com/donnemartin/system-design-primer
- **[R6]** lm-sys/FastChat, `llm_judge`: https://github.com/lm-sys/FastChat/tree/main/fastchat/llm_judge
- **[R7]** nlpyang/geval: https://github.com/nlpyang/geval
- **[R8]** prometheus-eval/prometheus-eval: https://github.com/prometheus-eval/prometheus-eval

### Tools compared

- **[T1]** AlgoMaster, Low-Level Design practice: https://algomaster.io/practice/low-level-design
- **[T2]** Hello Interview, Guided Practice: https://www.hellointerview.com/practice/overview
- **[T3]** LowLevelDesignMastery playground: https://www.lowleveldesignmastery.com/playground/ and its Show HN post: https://news.ycombinator.com/item?id=46541117
- **[T4]** workat.tech, What is a Machine Coding Round?: https://workat.tech/machine-coding/article/what-is-a-machine-coding-round-omfn1w54ojlg

[R1]: https://github.com/ashishps1/awesome-low-level-design
[R2]: https://github.com/prasadgujar/low-level-design-primer
[R3]: https://github.com/tssovi/grokking-the-object-oriented-design-interview
[R4]: https://github.com/iluwatar/java-design-patterns
[R5]: https://github.com/donnemartin/system-design-primer
[R6]: https://github.com/lm-sys/FastChat/tree/main/fastchat/llm_judge
[R7]: https://github.com/nlpyang/geval
[R8]: https://github.com/prometheus-eval/prometheus-eval