# HydraForge — Stress-Test Kit: Expected Results

Two contract fixtures plus one code fixture. The contracts exercise the **HIGH-confidence path** that MERGER_AGREEMENT_1 (permanently CONTESTED) can never reach. The code fixture is the only thing that can prove A2 still fails when it should — a document cannot, by design.

A stress test without an oracle is just another run. Each fixture below has expected outputs. Diff actual against expected; any mismatch is a finding.

---

## FIXTURE 01 — `STRESS_01_clean_merger.pdf` (the over-sensitivity test)

A well-drafted, balanced statutory merger: defined earnout with good-faith covenant, full indemnity (10% cap, 0.75% basket, 18-month/6-year survival), 10% escrow, working-capital true-up, MAE with disproportionate-effect carve-back, mutual termination + outside date, Delaware law/venue, integration clause present.

**Why it matters:** the analyzer has only ever seen hostile garbage. If it stamps *this* "Critical / Do Not Proceed," it's reflexively over-sensitive and useless to anyone with a real deal. This is the single most important gap to close before showing it to a customer.

| Field | Expected |
|---|---|
| `dealType` | `STATUTORY_MERGER` |
| `confidence` | `HIGH` — clean §251 mechanics, no asset/equity ambiguity |
| Suppressions | **APPLIED** with merger rationales ("by operation of law") — first non-short-circuit run of A2 |
| Disposition | Few/no `ALLOCATED_ADVERSE`; provisions present and market-standard |
| Tier | 4 (or 5) — negotiated, near-final |
| Net tier bump | ~0 (score is already high; no floor needed) |
| Score | **roughly 78–90** |
| Recommendation | **Proceed** or **Proceed with Conditions** — NOT Do Not Proceed |
| A1–A5 | all **PASS**; A2 passes via the *applied-rationale* branch, not the short-circuit |

**Failure signatures to watch:**
- Score lands Critical / Do Not Proceed → over-sensitivity; the analyzer can't recognize quality. Biggest possible finding.
- `confidence: CONTESTED` → your classifier is over-triggering CONTESTED; tighten the HIGH definition (this is the over-correction I warned about when we disabled suppression on contested deals).
- A2 reported via short-circuit ("nothing to contradict") → it didn't actually run the applied-rationale path, so this fixture didn't test what it's for. Confirm A2 took the applied branch.

---

## FIXTURE 02 — `STRESS_02_hostile_merger.pdf` (adverse-scoring on a HIGH deal + an A4 trap)

A clean §251 merger (so **HIGH, not CONTESTED**) that is nonetheless buyer-gutting: indemnity *present but* capped at 0.5% with a 3% tipping basket and 30-day survival; "as is" + express anti-sandbagging waiver; earnout at Buyer's "sole and absolute discretion" with no good-faith covenant; Seller terminates for convenience, Buyer only for adjudicated fraud. Genuinely *omitted*: working-capital adjustment, MAE definition, escrow.

**Why it matters:** tests `ALLOCATED_ADVERSE` scoring on a non-contested deal, and tests that disposition correctly separates present-but-hostile from absent. The indemnity here is the key case — it's *present* (so not OMITTED) but *gutted* (so ALLOCATED_ADVERSE). That's the exact distinction that took four rounds to fix; this confirms it holds when the structure is HIGH rather than CONTESTED.

| Field | Expected |
|---|---|
| `dealType` | `STATUTORY_MERGER` |
| `confidence` | `HIGH` — unambiguous merger; **must not be CONTESTED** |
| Suppressions | **APPLIED**, merger rationales → A2 checks them → **PASS** (no foreign terms) |
| Disposition: indemnity-gutting, as-is/sandbagging, earnout-discretion, asymmetric termination | `ALLOCATED_ADVERSE` |
| Disposition: working capital, MAE, escrow | `OMITTED` |
| Tier | 3 — fleshed out, not a skeleton (it *has* indemnity/earnout/termination; they're just hostile) |
| Net tier bump | small **positive** — leniency on the OMITTED items only |
| Score | **roughly 30–45** |
| Recommendation | **Do Not Proceed** |
| A3 | **PASS** — no leniency applied to the ALLOCATED_ADVERSE items |

### Predicted finding: A4 likely FALSE-FAILs here

Watch A4 specifically. As written (round 4), A4 is: `recommendation == DO_NOT_PROCEED && netTierBump > 0 → FAIL`. This fixture produces exactly that combination — Do Not Proceed (from the adverse terms) **and** a small positive bump (legitimate leniency on the *omitted* working-capital/MAE/escrow). That is **not** a contradiction: the mercy is on omitted items, the verdict is from adverse items — precisely the L3-A design. But A4's crude check can't tell the difference and will flag it.

If A4 fires here, it has the **same flaw A2 used to have**: it conflates "any leniency" with "leniency on the deal-breakers." The fix mirrors A3 — gate A4 on adverse-leniency, not total bump:

```ts
// A4 v2 — verdict/leniency coherence.
// A DNP verdict is contradicted only by leniency granted to the ADVERSE items
// that drove it — not by legitimate leniency on unrelated OMITTED gaps.
const lenientOnAdverse = resolved.some(
  r => r.reason === 'APPLIED' && /* finding is ALLOCATED_ADVERSE */ false
);
// Better: compute from findings, not suppressions —
const adverseGotLeniency = findings.some(
  f => f.disposition === 'ALLOCATED_ADVERSE' && f.lenarncyApplied === true
);
(recommendation === 'DO_NOT_PROCEED' && adverseGotLeniency)
  ? fail('A4', ['DNP verdict while leniency was applied to an ALLOCATED_ADVERSE finding'], 'Remove leniency from adverse findings (see A3); leniency on OMITTED gaps is permitted.')
  : pass('A4');
```

If A4 *passes* here instead, even better — it means you already refined it. Either way, this fixture tells you which.

---

## FIXTURE 03 — A2 negative control (CODE, not a document)

A2 cannot be made to FAIL by any contract, because the renderer derives applied rationales from `dealType`. The only way A2 fails is a regression that hardcodes or free-authors a contradictory rationale. So the teeth test is a unit test, not a PDF:

```ts
test('A2 fails when an APPLIED suppression cites a foreign structure', () => {
  const resolved: ResolvedSuppression[] = [
    { item: 'TSA Absence as Critical', suppressed: true, reason: 'APPLIED',
      rationale: '100% equity acquisition of standalone entity' }, // injected regression
  ];
  const r = checkA2('STATUTORY_MERGER', 'HIGH', resolved);
  expect(r.status).toBe('FAIL');           // must catch "equity" on a merger
  expect(r.detail[0]).toMatch(/TSA Absence/);
});

test('A2 passes on a clean HIGH merger via the applied branch (not short-circuit)', () => {
  const resolved: ResolvedSuppression[] = [
    { item: 'TSA Absence as Critical', suppressed: true, reason: 'APPLIED',
      rationale: 'surviving entity inherits operations by operation of law' },
  ];
  const r = checkA2('STATUTORY_MERGER', 'HIGH', resolved);
  expect(r.status).toBe('PASS');
  expect(r.note).toBeUndefined();          // proves it did NOT short-circuit
});

test('A2 short-circuits to PASS on CONTESTED', () => {
  const r = checkA2('STATUTORY_MERGER', 'CONTESTED', []);
  expect(r.status).toBe('PASS');
  expect(r.note).toMatch(/CONTESTED/);     // proves it DID short-circuit
});
```

These three prove A2 in all three states: **fails when wrong, passes when right via the real path, silent when there's nothing to judge.** The first test is the one that matters — if it doesn't fail, your scoping neutered the check, and the green suite is lying to you.

---

## Run order

1. **Fixture 03 first** (the unit tests) — 2 minutes, no pipeline run, proves A2 has teeth before you trust any PASS.
2. **Fixture 01** — confirm the analyzer can say "Proceed." If it can't, stop and fix over-sensitivity before anything else.
3. **Fixture 02** — confirm adverse-scoring on a HIGH deal, and watch whether A4 false-fails. If it does, apply A4 v2.

Expected end state: A2 verified in all three states, the analyzer scores a good deal well and a hostile deal badly, and A4 either passes correctly or gets the same omission/adverse fix A3 already has.
