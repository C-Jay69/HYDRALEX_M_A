# HydraForge — Checklist Section: Render-from-Data Fix

The "Detailed Analysis by Checklist Point" section leaks raw prompt scaffolding into customer output ("Assessment — if earnout formula not in text, state…", the whole California/Delaware/NY non-compete instruction block). Fixture 01's checklist filled in correctly; Fixture 02's dumped the stubs. Same template, two behaviors → it's nondeterministic, which means casual testing won't catch it and a client eventually sees the recipe instead of the meal.

This is the same disease as DEAL-TYPE — a section the LLM free-authors from a template that contains its own instructions. But the cure is a **hybrid**, not full data-derivation, because this section needs real per-point analysis. Three parts, in order of leverage.

---

## Part 1 (highest leverage, do this first) — separate instructions from the template

The single reason the scaffolding leaks is that it lives *inside the output template*. Move every instruction out of the template and into the system/instruction layer. The output template becomes clean labels with empty slots:

**Before (instructions embedded — echoable):**
```
8. Exclusivity / Non-Competition
Assessment — mandatory elements:
  Who is bound? Entity only vs. individual owners/members/key persons
  Governing law state — apply jurisdiction-specific analysis:
    • California: near-total ban; sale-of-business exception (§16601)...
    • Delaware: enforces reasonable non-competes...
```

**After (clean slot — nothing to echo):**
```
8. Exclusivity / Non-Competition: {assessment_noncompete}
```

All the "mandatory elements / jurisdiction-specific analysis" guidance moves to the system prompt as instructions to the model, never into the string it fills. A lazy model can now only leave `{assessment_noncompete}` empty or write "Not present" — it cannot echo instructions that aren't in the template. This alone stops ~all of the leak.

---

## Part 2 (the DEAL-TYPE pattern) — render gating + non-compete jurisdiction from data

Two things in this section are pure data and shouldn't be LLM-authored at all:

**(a) Present/absent gating.** Whether a checklist topic appears in the contract is a fact, not an assessment. Render it from the structured findings/clause index:

```ts
interface ChecklistPoint { id: string; label: string; topics: string[]; }

const CHECKLIST: ChecklistPoint[] = [
  { id: 'definitions',  label: '1. Definitions & Recitals',        topics: ['definitions','recitals'] },
  { id: 'price',        label: '2. Purchase Price & Consideration', topics: ['purchase_price','earnout','working_capital'] },
  { id: 'reps',         label: '3. Representations & Warranties',   topics: ['reps','knowledge_qualifier'] },
  { id: 'covenants',    label: '4. Covenants',                      topics: ['covenants'] },
  { id: 'closing',      label: '5. Conditions to Closing',          topics: ['closing_conditions','bringdown','mae_condition'] },
  { id: 'indemnity',    label: '6. Indemnification',                topics: ['indemnity','cap','basket','survival','escrow'] },
  { id: 'termination',  label: '7. Termination Provisions',         topics: ['termination'] },
  { id: 'noncompete',   label: '8. Exclusivity / Non-Competition',  topics: ['noncompete','exclusivity','nonsolicit'] },
  { id: 'boilerplate',  label: '9. Boilerplate',                    topics: ['governing_law','venue','dispute_resolution'] },
  { id: 'rwi',          label: '10. RWI',                           topics: ['rwi'] },
];

function pointFindings(p: ChecklistPoint, findings: Finding[]) {
  return findings.filter(f => p.topics.includes(f.topic));
}
```

For each point: if it has findings, the LLM-authored `{assessment}` slot carries the analysis (Part 1 keeps it clean). If it has none and the clause is absent, render a derived `"Not present in text."` — no LLM, no slot, nothing to leak.

**(b) Non-compete jurisdiction logic becomes a lookup, not prose instructions.** This is the big leaking block. It's conditional guidance that should only produce output when a non-compete actually exists — so make it data that fires on a finding, never a standing instruction in the template:

```ts
const NONCOMPETE_LAW: Record<string, string> = {
  CA: 'California — near-total ban; sale-of-business exception (§16601) requires an equity seller, not just an employee. Nationwide scope + multi-year + CA nexus = ENFORCEABILITY RISK.',
  DE: 'Delaware — enforces reasonable covenants with proper consideration.',
  NY: 'New York — blue-penciling allowed; scope weighed against legitimate interest.',
  FL: 'Florida — §542.335 statutory support; specific elements required.',
  TX: 'Texas — must be ancillary to an otherwise enforceable agreement and supported by consideration.',
};

function renderNonCompete(findings: Finding[]): string {
  const nc = findings.find(f => f.topic === 'noncompete');
  if (!nc) return 'Not present in text.';
  const law = NONCOMPETE_LAW[nc.governingLawState ?? ''] ?? `${nc.governingLawState ?? 'governing law'} — enforceability not assessed.`;
  const scope = nc.bindsIndividuals ? 'binds individual principals' : 'entity-only (gap: post-close competition via a new entity)';
  return `${nc.term ?? 'Term unspecified'}; ${scope}. ${law}`;
}
```

The California analysis now emits *only* when there's a non-compete with a CA nexus — never as a standing instruction block on a Delaware deal that has no non-compete (which is exactly what leaked in Fixture 02).

---

## Part 3 (deterministic backstop) — render-time scaffolding guard

Same philosophy as the A2 backstop: a tripwire that fires if scaffolding ever reaches output again, so a regression is loud instead of silent.

```ts
const SCAFFOLD_MARKERS = [
  /Assessment\s+—/i,
  /if earnout formula not in text/i,
  /apply jurisdiction-specific analysis/i,
  /mandatory elements:/i,
  /Who is bound\?/i,
  /note every knowledge qualifier/i,
  /compare cure periods for each party/i,
];

function assertNoScaffolding(renderedSection: string): string[] {
  return SCAFFOLD_MARKERS
    .filter(re => re.test(renderedSection))
    .map(re => re.source);
}
```

Run it on the assembled checklist section before the report is finalized. Non-empty result = a leak slipped through; log it (and ideally strip the offending lines) rather than ship them. Keep this even after Parts 1–2 — it's cheap and it's the thing that tells you if someone re-embeds an instruction in the template six months from now.

---

## While you're in the render paths — the "equity" ghost, third sighting

Separate from the checklist, Fixture 01's **"Risks Other Tools Overweight"** block still authors equity-flavored prose ("TSA absence in equity deal — INAPPLICABLE", "in a statutory merger… equity acquisition"). The structured DEAL-TYPE section is correct now; this L3-D summary is generating its own boilerplate, in a third location A2 doesn't scope to. A grep for `equity|stock purchase` across every render path will surface all remaining instances. Same fix family: this block should pull the suppression dispositions from the shared resolved object (Part 1 of the A2 fix), not re-narrate them.

---

## Regression target

Re-run both stress fixtures:
- **Checklist section contains no instruction fragments** — `assertNoScaffolding()` returns empty on both. This is the pass condition; it's binary and visible.
- Fixture 01's checklist still shows real per-point analysis (Part 1 keeps the LLM slot, just clean).
- Fixture 02's §8 reads "Not present in text." instead of the California instruction dump.
- Fixture 02 was the one that leaked; if its checklist is clean and Fixture 01's stays analytical, the hybrid worked — you killed the scaffolding without flattening the analysis.

If a fixture's checklist still leaks after Part 1, the instructions weren't fully removed from the template — grep the template itself for the marker strings above; one got left behind.
