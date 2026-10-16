# HydraForge — A4 Fix (and the A3 bug it exposed)

## What's actually wrong

You asked to fix A4. The real finding: **A3 and A4 are the same bug wearing two hats**, and both have been passing vacuously the whole time.

- **A4** (round 4): `recommendation == DO_NOT_PROCEED && netTierBump > 0 → FAIL`
- **A3** (round 4): `adverseCritical && netTierBump > 0 → FAIL`

Both use `netTierBump > 0` as a stand-in for "leniency was granted to the deal-breakers." That stand-in was correct *before* L3-A, when leniency was a blunt tier floor. After L3-A, leniency comes **only from OMITTED rows by construction** — so a Do-Not-Proceed deal that also has genuine omitted gaps legitimately carries a positive bump. Both checks would **false-fail** that, which is exactly the kind of false positive we spent rounds eliminating from A2.

Why neither has ever caught it: every test doc was Tier 3 ("Standard rubric applies. No artificial floor") → `netTierBump = 0` → the `> 0` condition never fired → vacuous PASS. A4's correctness has never been exercised. Same as A2 was for six rounds: green because the trigger never occurred, not because it works.

## The fix — one check that replaces both

The invariant we actually care about is: **leniency came only from OMITTED rows, and the applied bump equals exactly that.** If that holds, then a DNP verdict with a positive bump is *provably* legitimate — the bump is all omitted-gap mercy, none of it propping up a deal-breaker. That single invariant subsumes both old checks and can't false-fail STRESS_03.

```ts
// Requires each resolved provision row to carry its leniency contribution.
interface CalibRow { item: string; disposition: 'OMITTED' | 'ALLOCATED_ADVERSE'; leniencyPoints: number; }

function checkCalibration(rows: CalibRow[], netTierBump: number): AssertionResult {
  // 1. No adverse row may receive any leniency.
  const adverseWithLeniency = rows.filter(r => r.disposition === 'ALLOCATED_ADVERSE' && r.leniencyPoints > 0);
  if (adverseWithLeniency.length) {
    return { id: 'CALIB', status: 'FAIL',
      detail: adverseWithLeniency.map(r => `${r.item} (ALLOCATED_ADVERSE) received ${r.leniencyPoints} leniency pts`),
      fix: 'Leniency may come only from OMITTED rows; recompute per L3-A.' };
  }
  // 2. The applied bump must equal the OMITTED-only leniency sum — nothing else snuck in.
  const omittedSum = rows.filter(r => r.disposition === 'OMITTED').reduce((s, r) => s + r.leniencyPoints, 0);
  if (netTierBump !== omittedSum) {
    return { id: 'CALIB', status: 'FAIL',
      detail: [`netTierBump=${netTierBump} != OMITTED leniency sum=${omittedSum}`],
      fix: 'Applied bump includes points not attributable to OMITTED rows.' };
  }
  return { id: 'CALIB', status: 'PASS' };
}
```

**Wiring (the one dependency):** each provision row needs `leniencyPoints` — the per-row contribution L3-A already computes when it sums the bump. If your L3-A only emits the aggregate `netTierBump`, expose the per-row number too. Same pattern as every fix this session: the data exists one layer up, it just has to reach the check.

**Retire A3 and A4; replace with `CALIB`.** Don't keep two crude checks plus the correct one — that's the redundancy that caused this. One check, correct, earning its place.

> A note on the verdict-coherence idea (a distinct A4): tempting to repurpose A4 as "recommendation must match findings severity." I'd *not* do that tonight — the naive version ("PROCEED + any CRITICAL finding → FAIL") would false-fail Fixture 01, which is "Proceed with Minor Revisions" while carrying a 🔴 earnout finding. A 🔴 "must-fix-before-signing" item is compatible with proceed-with-revisions, so that check needs careful definition and we haven't seen the failure it'd catch. Leave it; don't add a speculative check that reintroduces a false positive.

## Verify it — STRESS_03 (`STRESS_03_skeleton_dnp.pdf`)

This is the fixture that's been missing: a **Tier-1 skeleton** that is **Do-Not-Proceed** (from ALLOCATED_ADVERSE deal-breakers: as-is waiver, no-indemnity + assume-all-liabilities, asymmetric termination) **and** has **genuine OMITTED gaps** (no reps, no definitions, no working capital, no MAE, no escrow, no survival). Tier 1 means the floor mechanic fires → omitted gaps earn leniency → **positive bump while DNP**. No prior doc produced that combination.

Run it **before** applying the fix, then **after**:

| | Old A3 / A4 (`bump > 0`) | New `CALIB` |
|---|---|---|
| STRESS_03 | **FAIL** (false positive — bump is legit OMITTED mercy) | **PASS** (bump == OMITTED sum; no adverse got leniency) |

Seeing A3/A4 **FAIL on STRESS_03 before the fix** is the proof the bug is real and that this fixture finally exercises the path. Seeing `CALIB` **PASS after** is the proof the fix is correct. That before/after is the whole verification — it's the negative control A4 never had.

Expected STRESS_03 analysis (post-fix):
- `dealType: STATUTORY_MERGER`, `confidence: HIGH` (clean §251, no asset/equity ambiguity).
- Tier 1 — Skeleton.
- Disposition: §3 as-is, §4 no-indemnity+assume-liabilities, §5 asymmetric termination → `ALLOCATED_ADVERSE`. Reps, definitions, working capital, MAE, escrow, survival → `OMITTED`.
- `netTierBump`: **positive** (OMITTED floor leniency), e.g. +10 to +15.
- Score: low; **Do Not Proceed** (adverse terms scored full-weight).
- `CALIB: PASS` — bump traced entirely to OMITTED rows; zero leniency on the three adverse deal-breakers.

### Unit tests (the teeth check — same discipline as A2)

```ts
test('CALIB fails if an ALLOCATED_ADVERSE row got leniency', () => {
  const rows = [{ item: 'Indemnity reversal', disposition: 'ALLOCATED_ADVERSE', leniencyPoints: 5 }];
  expect(checkCalibration(rows, 5).status).toBe('FAIL');           // the real guard
});

test('CALIB passes on DNP + positive bump when bump is OMITTED-only (the old false-fail case)', () => {
  const rows = [
    { item: 'as-is waiver',        disposition: 'ALLOCATED_ADVERSE', leniencyPoints: 0 },
    { item: 'working capital gap', disposition: 'OMITTED',           leniencyPoints: 8 },
    { item: 'MAE gap',             disposition: 'OMITTED',           leniencyPoints: 5 },
  ];
  expect(checkCalibration(rows, 13).status).toBe('PASS');          // STRESS_03 in miniature
});

test('CALIB fails if the bump exceeds the OMITTED sum (stray points)', () => {
  const rows = [{ item: 'MAE gap', disposition: 'OMITTED', leniencyPoints: 5 }];
  expect(checkCalibration(rows, 9).status).toBe('FAIL');           // 9 != 5 → something leaked in
});
```

The middle test is the one that matters — it's the exact case old A3/A4 got wrong, and STRESS_03 in unit form. If it passes and the first one fails, the check has teeth and the false positive is gone.

## Done-condition

- `CALIB` replaces A3 and A4 in the reconciler.
- STRESS_03 shows A3/A4 FAIL pre-fix, `CALIB` PASS post-fix.
- The three unit tests pass.
- The four prior runs (MERGER_AGREEMENT_1, Fixtures 01/02) still PASS — they all had `netTierBump = 0`, so `CALIB` passes trivially and correctly, no regression.

That's a real, bounded, verified accomplishment: the calibration-check layer is now correct *and* proven, not just green. Good place to stop.
