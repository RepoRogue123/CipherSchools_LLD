# Research notes

This research was done before writing any code. The goal was to understand why low-level design (LLD) practice is hard to evaluate, what existing tools do about it, and where a small product could do better.

## 1. The learner problem

The typical way people practise LLD today:

1. Pick a classic problem (parking lot, elevator, vending machine) from a list or a YouTube playlist.
2. Sketch classes on paper, Excalidraw or in code.
3. Compare the result with a reference solution from a blog, a GitHub repo or a video.

Step 3 is where it breaks down. A reference solution tells you that your design is *different*, not whether it is *worse*. Two good designs for the same problem can look nothing alike: one uses the State pattern for a vending machine, another uses an enum with a transition table, and both are defensible. So learners either conclude they are wrong when they are merely different, or conclude they are right because their class names match.

Across the tools reviewed below and the discussions around them, five gaps come up repeatedly:

| Gap | What it looks like for the learner |
|---|---|
| No judgement of *quality* | "My design has a `ParkingLot` and a `ParkingSpot`, like the video. Is it good?" |
| Feedback without evidence | Generic comments ("consider SOLID") that could apply to any design. |
| Extensibility is claimed, not tested | Everyone says their design is extensible; nobody checks what happens when requirements change. |
| No trade-off practice | Learners list classes but never say why they chose one structure over another. |
| No memory | Each attempt is a one-off. Nothing notices that you keep scoring weak on the same thing. |

What the platform should keep from an attempt follows from these gaps: the exact design that was reviewed (so feedback can quote it), how long the attempt took, what changed between attempts, and per-criterion scores over time.

## 2. Existing tools

| Tool | How you practise | What you submit | How feedback works | Learning loop | Gap for this brief |
|---|---|---|---|---|---|
| [AlgoMaster LLD practice](https://algomaster.io/practice/low-level-design) | Read a contract, implement a class, run examples, submit | Code in one of several languages | Hidden tests are a gate, then an AI reviewer scores against a published rubric (encapsulation, "where the rules live", structure) with written feedback. The rubric is visible before you start. | Submission history; an "Evaluate" button gives feedback without affecting history | Code-first: it measures language fluency as much as design, and there is no unseen change request |
| [Hello Interview Guided Practice](https://www.hellointerview.com/practice/overview) | Step-by-step prompts that mirror a real interview | Whiteboard drawing and text per step | Instant per-step, rubric-based AI coaching | Track-based practice | Strongest for HLD; step scoring is opaque |
| [LowLevelDesignMastery playground](https://www.lowleveldesignmastery.com/playground/) ([Show HN](https://news.ycombinator.com/item?id=46541117)) | Requirements, then a UML builder, then code, then AI review | UML diagram plus code | "Structured AI feedback" on the code | XP, levels, achievements | Gamified; the review targets code rather than the reasoning behind the design |
| [workat.tech machine coding](https://workat.tech/machine-coding/article/what-is-a-machine-coding-round-omfn1w54ojlg) | Timed coding against requirements, then an interviewer code review | Working code | Human criteria: working, modular, separation of concerns, and **"should easily accommodate new requirements with minimal changes"** | None (content, not a platform) | No self-serve feedback |
| [awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design), blogs, videos | Read a problem and compare with a solution | Nothing | None: a static answer | None | "Different from the reference" is not the same as "wrong" |
| General chat assistant | Paste a design and ask "is this good?" | Free text | Unconstrained, often lenient, varies run to run | None | The exact anti-pattern the brief warns about |

Common threads:

- The better tools **publish their rubric** up front (AlgoMaster). That builds trust and tells the learner what "good" means before they start. DesignLoop does the same (`/rubric`).
- The better tools **structure the work into steps** that mirror the interview (Hello Interview). DesignLoop's editor is a sequence of sections for the same reason.
- Interview guides consistently say the real test is **how a design absorbs new requirements** (workat.tech's "minimal changes" criterion). Interviewers do this live ("now add EV charging"). None of the self-serve tools looked at simulate it. That became DesignLoop's main product idea, the curveball.

## 3. What makes feedback useful when many designs are valid

The research points to judging *properties* rather than *shapes*:

- Score each design against the same criteria (responsibilities, coupling, encapsulation and so on), each with described levels, instead of against a reference solution.
- Tell the reviewer what varies in each problem (pricing rules, allocation policy, payment methods). Then "abstraction at a real variation point" can be judged for the specific problem without prescribing class names.
- Make every judgement cite the learner's own words, so feedback is specific and checkable.
- Show alternative designs only *after* the attempt, framed as trade-offs, not answers.
- Test extensibility behaviourally: reveal a change the learner has not seen, freeze the design, and ask them to explain the impact. How much of the original design they have to edit (versus add to) is directly observable.

## 4. Using an LLM as a reviewer: known failure modes

The LLM-as-a-judge literature is consistent about what goes wrong with unconstrained model grading. Each failure mode below became a concrete design decision.

| Known problem | Source | DesignLoop's countermeasure |
|---|---|---|
| Inconsistent scores run to run; vague criteria interpreted differently each time | [Kim et al., Prometheus (2023)](https://arxiv.org/abs/2310.08491): evaluation conditioned on a score rubric that describes every level correlates closely with human graders | Fixed rubric with a described level for every score (`content/rubric.v1.json`); temperature 0.2; structured output validated by a schema |
| Scores improve when the model reasons before scoring | [Liu et al., G-Eval (2023)](https://arxiv.org/abs/2303.16634): chain-of-thought plus a form-filling output | The output schema orders **evidence → reasoning → score** per criterion |
| Verbosity bias: longer answers get higher scores | [Zheng et al., MT-Bench (2023)](https://arxiv.org/abs/2306.05685) | The prompt says length is not quality; deterministic caps apply when evidence is missing regardless of length |
| Generous scores backed by invented justification | Zheng et al. document self-enhancement bias; confident but unsupported justifications are a common failure in practice | Every quote is verified against the submission text; unverified quotes are flagged, and a high score with no verified evidence is marked low confidence |
| Prompt injection from graded content | General LLM security guidance | The submission is fenced as data inside `<submission>` tags with an explicit instruction never to follow instructions inside it; caps bound the score anyway |
| A single "score out of 100" hides everything | The assignment brief itself | No overall AI number. The overall band is computed deterministically from per-criterion rubric levels |

## 5. Where deterministic logic beats a model

Some checks are facts, and a model adds cost and randomness to them:

- Required structure (enough entities, at least one flow, a change-impact explanation).
- Consistency (relationships pointing at entities that exist, class-like names used but never declared).
- Traceability (which requirements are mapped to the design).
- Metrics (how many existing classes the curveball modifies versus how many it adds).
- Workflow rules (state transitions, idempotent submits, retries).

These run on every autosave, block the next step when something essential is missing, and are passed to the model as facts. The model handles the judgement calls: quality of responsibilities, coupling, appropriateness of abstractions, credibility of the change explanation, and suggestions.

## 6. Choosing the submission format

| Option | What it proves | Cost for a 2-day MVP | Verdict |
|---|---|---|---|
| Free text | Reasoning, if the learner volunteers it | Cheap to build; almost nothing can be checked deterministically | Too loose |
| Code | Real interfaces, coupling, testability | Needs a sandbox, is tied to one language, and mixes language fluency with design skill | Too heavy, and off-target |
| Class diagram | Structure and relationships | Needs a diagram editor or parser; shows *what* but not *why* | A good second format, not the first |
| **Structured design document** | Scope, entities with responsibilities, relationships, traceability, behaviour, edge cases, decisions, and the change response | Plain form inputs; exact deterministic checks; each section can be quoted | **Chosen** |

The structured document is the smallest format where every rubric criterion has a section that provides evidence for it (see [DESIGN.md](DESIGN.md#3-the-submission-format)). It is also language-agnostic and mirrors the interview conversation that happens before any code is written.

## 7. What I would research next

- Watch five learners use the prototype with a timer. Where do they stall, and do they read the feedback or skip to the score?
- Have two experienced interviewers score ten submissions against the same rubric and measure agreement with the AI reviewer.
- Check whether the rotating curveball changes behaviour on the second attempt: do learners design more extension points, or over-engineer?

## Sources

- AlgoMaster, Low-Level Design practice: https://algomaster.io/practice/low-level-design
- Hello Interview, Guided Practice: https://www.hellointerview.com/practice/overview
- LowLevelDesignMastery, playground: https://www.lowleveldesignmastery.com/playground/ and Show HN discussion: https://news.ycombinator.com/item?id=46541117
- workat.tech, What is a Machine Coding Round?: https://workat.tech/machine-coding/article/what-is-a-machine-coding-round-omfn1w54ojlg
- ashishps1, awesome-low-level-design: https://github.com/ashishps1/awesome-low-level-design
- Zheng et al. (2023), *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*: https://arxiv.org/abs/2306.05685
- Liu et al. (2023), *G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment*: https://arxiv.org/abs/2303.16634
- Kim et al. (2023), *Prometheus: Inducing Fine-grained Evaluation Capability in Language Models*: https://arxiv.org/abs/2310.08491
- Google, Gemini API OpenAI compatibility and rate limits: https://ai.google.dev/gemini-api/docs/openai, https://ai.google.dev/gemini-api/docs/rate-limits
- Groq, Structured outputs: https://console.groq.com/docs/structured-outputs
