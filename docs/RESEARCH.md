# Research note

Why is low-level design (LLD) practice hard to evaluate, what do existing tools do about it, and where can a small product do better? This note was written before any code.

## 1. The learner problem

Most learners practise LLD the same way: pick a classic problem (parking lot, elevator, vending machine), sketch classes on paper or in code, then compare the result with a reference solution from a blog, a repo or a video.

That last step is where it breaks. A reference solution tells you your design is *different*, not whether it is *worse*. Two good designs can look nothing alike: one vending machine uses the State pattern, another uses an enum with a transition table, and both are defensible. Learners either conclude they are wrong when they are only different, or that they are right because their class names match.

To improve on the next attempt, a learner needs three things:

- **Judgement of qualities**, not of shape: are responsibilities clear, is change absorbed cheaply, are trade-offs understood?
- **Evidence**: which part of *their* design caused each judgement.
- **Memory**: what they keep getting wrong across attempts.

So the platform has to retain the exact design that was reviewed (so feedback can quote it), per-criterion scores over time, and what changed between attempts.

## 2. Existing approaches

| Tool | What you submit | How feedback works | What's missing for this brief |
|---|---|---|---|
| [AlgoMaster LLD practice](https://algomaster.io/practice/low-level-design) | Code | Hidden tests gate, then an AI reviewer scores against a rubric that is **published before you start** | Code-first, so it measures language fluency as much as design; no unseen change request |
| [Hello Interview Guided Practice](https://www.hellointerview.com/practice/overview) | Whiteboard and text, step by step | Instant rubric-based AI coaching **per interview step** | Built mainly for HLD; step scores are opaque |
| [LowLevelDesignMastery](https://www.lowleveldesignmastery.com/playground/) ([Show HN](https://news.ycombinator.com/item?id=46541117)) | UML diagram, then code | AI review of the code; XP and levels | Reviews the code, not the reasoning behind the design |
| [workat.tech machine coding](https://workat.tech/machine-coding/article/what-is-a-machine-coding-round-omfn1w54ojlg) | Working code, reviewed by an interviewer | Criteria include **"accommodate new requirements with minimal changes"** | No self-serve feedback |
| [awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design), blogs, videos | Nothing | A static reference answer | "Different from the reference" is not "wrong" |
| A general chat assistant | A pasted design | "Is this good?" gives unconstrained, lenient answers that vary run to run | The anti-pattern the brief warns about |

What the better tools get right: they publish the rubric up front, and they structure the work into steps that mirror the interview. What interviewers consistently test, and none of the self-serve tools simulate, is **how a design absorbs a requirement it wasn't built for** ("now add EV charging").

## 3. Key gaps

1. **No judgement of quality.** Comparison with a reference answer judges shape, not qualities.
2. **Feedback without evidence.** Generic advice ("consider SOLID") that could apply to any design.
3. **Extensibility is claimed, not tested.** Every learner says their design is extensible; nothing checks it.
4. **No trade-off practice.** Learners list classes but rarely say why one structure beat another.
5. **No memory.** Each attempt is a one-off; nothing notices a recurring weakness.

Using an LLM as the judge adds its own known risks: inconsistent scores on vague criteria, verbosity bias, and confident justifications that aren't in the submission ([Zheng et al., 2023](https://arxiv.org/abs/2306.05685)).

## 4. Product direction

DesignLoop answers each gap with one mechanism:

| Gap | DesignLoop's answer |
|---|---|
| No judgement of quality | A **public rubric**: 8 criteria, each with a description of what 1, 2, 3 and 4 look like. No reference answer. Reviewer notes list what varies in each problem, so "abstraction in the right place" is judged per problem without prescribing class names. |
| Feedback without evidence | Every judgement **quotes the learner's design**, and each quote is **checked against the submission** before it is shown. |
| Extensibility is claimed | **The curveball**: once the design is ready, reveal a change request the learner hasn't seen and lock the design. They then explain which classes the change edits and which it adds. |
| No trade-off practice | A required **decisions** section (decision, alternative, rationale), and a score cap when it's missing. |
| No memory | Attempt history, a per-criterion comparison with the last attempt, **recurring weak criteria**, and the last review's next moves pinned to the next attempt. |

Two supporting decisions come out of the same research.

**What to submit.** A **structured design document**: assumptions, entities with responsibilities, relationships, requirement mapping, key flows, edge cases, decisions, and the change impact. It is the smallest format where every rubric criterion has something to quote.
- Code needs a sandbox and mixes language fluency with design skill.
- Free text can't be checked mechanically.
- A class diagram shows *what* but not *why*. It makes a good second format later.

**Where the AI stops.** Structure, traceability and consistency are facts, so plain code checks them instantly on every save. The model judges quality, against a rubric that describes every level ([Kim et al., 2023](https://arxiv.org/abs/2310.08491)). It must give evidence before its score ([Liu et al., 2023](https://arxiv.org/abs/2303.16634)), its reply is validated against a schema, and plain-code caps bound its scores when evidence is plainly missing. There is no "score out of 100".

### Open questions for the next round

- Watch learners use it with a timer. Do they read the evidence, or skip to the score?
- How closely does the AI reviewer agree with two experienced interviewers scoring the same ten designs?
- Does the rotating curveball lead to better extension points on the second attempt, or to over-engineering?

## Sources

- AlgoMaster, Low-Level Design practice: https://algomaster.io/practice/low-level-design
- Hello Interview, Guided Practice: https://www.hellointerview.com/practice/overview
- LowLevelDesignMastery playground: https://www.lowleveldesignmastery.com/playground/ and its Show HN post: https://news.ycombinator.com/item?id=46541117
- workat.tech, *What is a Machine Coding Round?*: https://workat.tech/machine-coding/article/what-is-a-machine-coding-round-omfn1w54ojlg
- ashishps1, awesome-low-level-design: https://github.com/ashishps1/awesome-low-level-design
- Zheng et al. (2023), *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*: https://arxiv.org/abs/2306.05685
- Liu et al. (2023), *G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment*: https://arxiv.org/abs/2303.16634
- Kim et al. (2023), *Prometheus: Inducing Fine-grained Evaluation Capability in Language Models*: https://arxiv.org/abs/2310.08491
