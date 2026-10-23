# M&A Contract Analyzer Improvement Plan

## Overview
Based on analysis of 4 contract types from the HYDRALEX M&A project, this plan identifies specific areas where the merger risk analyzer accuracy can be improved.

## Current Performance Summary

| Contract Type | Raw Score | Final Score | Critical Issues |
|--------------|-----------|-------------|-----------------|
| Asset Purchase (ma_agreement_v1.txt) | 24/100 | 34/100 | Missing indemnification framework, undefined terms |
| Clean Merger (clean_merger.pdf) | 9/100 | 24/100 | Section mismatches, missing cap/survival |
| Real M&A (caesars_eldorado_merger.pdf) | 1/100 | 8/100 | Complete tax silence, no indemnification |
| Hostile Merger (hostile_merger.pdf) | 0/100 | 5/100 | Basket above cap, no fraud carve-out, undefined metrics |

## Priority Improvements

### 1. Tax Survival Period Classification (HIGH Impact)
**Problem**: The analyzer currently doesn't distinguish between:
- General representations survival (12-24 months)
- Tax representations survival (statute of limitations + 60 days)
- Fundamental representations survival (indefinite)

**Current behavior**: Flags all survival periods < 365 days as "too short" without categorization

**Improvement**: Add taxonomy for survival period types with different thresholds:
- General reps: 12-24 months (flag if < 12 months)
- Tax reps: SOL + 60 days (flag if < SOL + 60 days)  
- Fundamental reps: Indefinite (flag if any finite period)

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_indemnity_economics()` method

### 2. Earnout Metric Definition Parsing (HIGH Impact)
**Problem**: The analyzer correctly flags undefined metrics but doesn't parse or validate when metrics ARE defined

**Improvement**: 
- Add metric extraction logic to identify defined metrics and their types
- Distinguish between Revenue, EBITDA, Gross Profit, Net Income targets
- Check for minimum required fields: target values, measurement period, calculation methodology

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_earnout()` method

### 3. Fraud Carve-Out Detection Refinement (MEDIUM Impact)
**Problem**: The analyzer flags "all claims" language sweeping fraud under the cap, but doesn't distinguish:
- Affirmative "carve-out is limited" language
- Mere omission of fraud carve-out in otherwise standard language

**Improvement**: 
- Add detection for explicit fraud carve-out language: "shall not apply to fraud", "except for fraud", "uncapped for fraud"
- Only flag when the cap language AFFIRMATIVELY sweeps fraud under it
- Allow for standard language where fraud carve-out is implied by default

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_indemnity_economics()` method, fraud carve-out section

### 4. Escrow vs Termination Fee Distinction (MEDIUM Impact)
**Problem**: The analyzer sometimes confuses escrow release timing with termination fee applicability

**Improvement**: 
- Clarify that escrow (at closing) and termination fees (for non-closing scenarios) serve different purposes
- Add logic to detect when both exist and are properly scoped
- Ensure escrow survival mismatch detection doesn't flag cases where termination fee exists

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_escrow_survival_mismatch()` method

### 5. Controlling Term Variant Detection (MEDIUM Impact)
**Problem**: The analyzer doesn't handle term variants well (e.g., "Company Stockholders" for "Stockholders")

**Improvement**: 
- Add logic to detect term variants from defined phrases
- When "Company Stockholders" is referenced, check if "Stockholders" is defined
- Support common patterns: "Acquiror Inc. ('Buyer')", "('Seller')" patterns

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_controlling_terms()` method

### 6. SEC Exhibit / Disclosure Schedule Exemption (MEDIUM Impact)
**Problem**: The readiness gate sometimes blocks execution when SEC exhibits are referenced

**Improvement**: 
- Enhance detection of SEC exhibit references (EX-2.1, Exhibit 2.1 format)
- Exempt SEC exhibits from missing schedule execution gate
- Only flag missing schedules as blockers for non-SEC documents

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_check_readiness_gate()` method

### 7. Skeleton Draft Detection Enhancement (LOW Impact)
**Problem**: The current skeleton draft detection is basic (word count, schedule count)

**Improvement**: 
- Add detection for draft-specific language: "SAMPLE", "DRAFT", "INTENT"
- Better detection of incomplete section numbering
- Distinguish between Tier 1 skeleton and fully-developed drafts

**Code location**: `packages/python-engine/merger_risk_analyzer.py` `_detect_skeleton_draft()` method

## Implementation Roadmap

### Phase 1: Critical Accuracy Improvements (1-2 weeks)
1. Tax survival period classification
2. Earnout metric definition parsing
3. Fraud carve-out detection refinement

### Phase 2: Enhanced Detection (2-3 weeks)
4. Escrow vs termination fee distinction
5. Controlling term variant detection
6. SEC exhibit exemption enhancement

### Phase 3: Polish & Edge Cases (1 week)
7. Skeleton draft detection enhancement
8. Additional test cases and validation

## Verification Plan

After each improvement, verify with the existing contract sample set:

- **All 4 contract types** should show improved detection accuracy
- **No regressions** - existing findings should not be lost
- **Adjusted scores** should more accurately reflect actual risk levels
- **Must-fix items** should be more precisely prioritized

## Success Metrics

- Tax survival classification correct in ≥ 90% of cases
- Earnout metric detection improved from 0% to ≥ 70% recognition rate
- Fraud carve-out false positives reduced by ≥ 50%
- Escrow/survival mismatch detection with ≥ 80% accuracy on real contracts
- Controlling term variant detection for ≥ 80% of term references