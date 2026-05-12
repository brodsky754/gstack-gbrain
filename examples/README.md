# examples

Short walk-throughs showing gstack and gbrain working together inside a single Claude Code session.

These are not runnable scripts — they're transcripts/recipes to read.

## 1. Plan, ship, and remember

```text
You:    I want to add rate limiting to the /api/search endpoint. Should I?

Claude: [invokes /office-hours]
        - clarifies traffic profile, abuse model, current pain
        - lands on: yes, token bucket per IP, 60 req/min
        - drops the plan as a brain page: projects/myapp/2026-05-rate-limiting

You:    Plan it.

Claude: [invokes /autoplan]
        - CEO review (is this the right thing?)
        - design review
        - eng review
        - emits an implementation plan

You:    Ship it.

Claude: [implements, runs tests, then invokes /ship]
        - bumps VERSION + CHANGELOG
        - runs review + qa
        - opens PR
        - after merge, files a brain page summarizing what shipped
          (projects/myapp/2026-05-rate-limiting-shipped)
```

Next session, when someone asks "do we have rate limiting?", `gbrain query "rate limiting"` returns the page in <100ms.

## 2. Investigate, then teach the brain

```text
You:    /api/search is returning 500s in prod, intermittent.

Claude: [invokes /investigate]
        - reproduces locally
        - traces to a missing index on a hot query
        - fixes the index
        - writes a postmortem brain page: incidents/2026-05-search-500s
          with: root cause, fix, detection gap, prevention checklist

You:    [next month] We're seeing 500s on /api/orders.

Claude: [queries gbrain first, finds the prior incident]
        - reuses the same diagnostic ladder
        - identifies a similar missing index
        - skips the wrong leads it tried last time
```

The second investigation is fast because the brain remembered the first.

## 3. Security audit, with prior context

```text
You:    /cso

Claude: [first checks gbrain for prior audit findings]
        - finds: audits/2026-Q1-myapp listed 3 open issues
        - factors that into this audit's scope
        - runs OWASP Top 10 + STRIDE
        - emits a report
        - files: audits/2026-Q2-myapp with delta vs Q1
```

The audit is incremental, not redundant.

---

These are illustrative. Adapt to your actual project. The shared pattern: **gstack does the work, gbrain remembers it.**
