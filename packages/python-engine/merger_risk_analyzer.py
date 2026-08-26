# merger_risk_analyzer.py
# M&A Merger Agreement Risk Scoring Engine v2.0

import re
import yaml
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from formation_validator import FormationValidator, FormationValidationResult

# Negation guard: a clause that says "no indemnification" / "shall not indemnify"
# must NOT be treated as an indemnity being present (see _has_affirmative_indemnification).
_NEGATION_RE = re.compile(
    r"(?:no|not|shall\s+not|will\s+not|would\s+not|without|never|there\s+shall\s+be\s+no)\s+"
    r"(?:indemnification|indemnity|indemnif|hold\s+harmless)",
    re.IGNORECASE,
)

@dataclass
class RiskFinding:
    """Individual risk finding from document analysis"""
    rule: str
    deduction: int
    description: str
    severity: str
    location: Optional[str] = None
    suggestion: Optional[str] = None

@dataclass
class AnalysisResult:
    """Complete analysis result for a document"""
    document_name: str
    raw_score: int
    skeleton_leniency_applied: int
    final_score: int
    risk_level: str
    recommendation: str
    findings: List[RiskFinding]
    interaction_stacks_triggered: List[Dict]
    arbitration_threshold: Optional[Dict]
    strengths: List[str]
    missed_items: List[str]
    must_fix_items: List[Dict]
    adjusted_score_if_fixed: int
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    merger_structure_valid: bool = True
    currency_specified: bool = True
    phantom_references: List[str] = field(default_factory=list)
    mismatched_sections: List[str] = field(default_factory=list)
    tax_gap_detected: bool = False
    formation_deductions: int = 0
    readiness_blocked: bool = False

_DEFAULT_CONFIG = str(Path(__file__).parent / "merger_scoring_config.yaml")

class MergerRiskAnalyzer:
    """M&A Merger Agreement Risk Scoring Engine"""

    def __init__(self, config_path: str = _DEFAULT_CONFIG):
        """Initialize analyzer with YAML configuration"""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.base_score = self.config['config']['base_score']
        self.skeleton_leniency = self.config['config']['skeleton_draft_leniency']
        
        # Formation validator (runs BEFORE main checks)
        self.formation_validator = FormationValidator(self.config)
        
        # Compile regex patterns for faster detection
        self._compile_patterns()
        
    def _compile_patterns(self):
        """Compile all regex patterns from config"""
        self.patterns = {}
        patterns_config = self.config.get('detection_patterns', {})
        
        for category, category_patterns in patterns_config.items():
            self.patterns[category] = {}
            if isinstance(category_patterns, dict):
                for name, pattern_info in category_patterns.items():
                    if isinstance(pattern_info, dict) and 'patterns' in pattern_info:
                        self.patterns[category][name] = [
                            re.compile(p, re.IGNORECASE) for p in pattern_info['patterns']
                        ]
                    elif isinstance(pattern_info, list):
                        self.patterns[category][name] = [
                            re.compile(p, re.IGNORECASE) for p in pattern_info
                            if isinstance(p, str)
                        ]
    
    def analyze(self, document_text: str, document_name: str = "unknown") -> AnalysisResult:
        """
        Main analysis entry point
        """
        findings = []
        
        # Run formation validation FIRST (pre-analysis structural checks)
        formation_result = self.formation_validator.run(document_text)
        
        # Convert FormationFindings to RiskFindings and prepend
        for ff in formation_result.findings:
            findings.append(RiskFinding(
                rule=ff.rule,
                deduction=ff.deduction,
                description=ff.description,
                severity=ff.severity,
                location=ff.location,
                suggestion=ff.suggestion,
            ))
        
        # Run all detection checks
        findings.extend(self._check_indemnification(document_text))
        findings.extend(self._check_indemnity_economics(document_text))
        findings.extend(self._check_earnout(document_text))
        findings.extend(self._check_termination(document_text))
        findings.extend(self._check_reps_and_warranties(document_text))
        findings.extend(self._check_assumption_of_liabilities(document_text))
        findings.extend(self._check_definitions(document_text))
        findings.extend(self._check_boilerplate(document_text))
        findings.extend(self._check_contradictions(document_text))
        findings.extend(self._check_operational_risks(document_text))
        findings.extend(self._check_covenants(document_text))
        findings.extend(self._check_escrow_and_security(document_text))
        findings.extend(self._check_documentation_quality(document_text))
        findings.extend(self._check_party_integrity(document_text))
        findings.extend(self._check_indemnification_procedures(document_text))
        findings.extend(self._check_escrow_survival_mismatch(document_text))
        findings.extend(self._check_controlling_terms(document_text))
        findings.extend(self._check_liability_assumption(document_text))
        findings.extend(self._check_termination_asymmetry(document_text))
        findings.extend(self._check_reliance_waiver(document_text))

        # Calculate raw score (formation deductions included in total)
        total_deductions = sum(f.deduction for f in findings)
        raw_score = max(0, self.base_score - total_deductions)

        # Apply skeleton leniency (Tier 1 draft adjustment)
        is_skeleton = self._detect_skeleton_draft(document_text)
        skeleton_leniency = self.skeleton_leniency if is_skeleton else 0
        final_score = min(100, raw_score + skeleton_leniency)

        # Execution-readiness gate: ghost obligor / missing operative documents /
        # undefined controlling terms block execution. Cap the score (parity with
        # the TS pipeline's runReadinessGate).
        readiness_blocked = self._check_readiness_gate(document_text, findings)
        if readiness_blocked:
            final_score = min(final_score, 34)

        # Apply interaction weighting
        interaction_stacks = self._apply_interaction_weighting(document_text, findings)
        for stack in interaction_stacks:
            final_score = max(0, final_score - stack.get('compounded_deduction', 0))
        
        # Determine risk level
        risk_level, recommendation = self._get_risk_level(final_score)
        
        # Generate strengths and missed items
        strengths = self._identify_strengths(findings, document_text)
        missed_items = self._identify_missed_items(document_text)
        must_fix_items = self._prioritize_must_fix(findings)
        
        # Calculate adjusted score if fixes applied
        adjusted_score = self._calculate_adjusted_score(final_score, must_fix_items)
        
        # Get arbitration threshold
        arbitration_threshold = self._get_arbitration_threshold(document_text)
        
        return AnalysisResult(
            document_name=document_name,
            raw_score=raw_score,
            skeleton_leniency_applied=skeleton_leniency,
            final_score=final_score,
            risk_level=risk_level,
            recommendation=recommendation,
            findings=findings,
            interaction_stacks_triggered=interaction_stacks,
            arbitration_threshold=arbitration_threshold,
            strengths=strengths,
            missed_items=missed_items,
            must_fix_items=must_fix_items,
            adjusted_score_if_fixed=adjusted_score,
            merger_structure_valid=formation_result.merger_structure_valid,
            currency_specified=formation_result.currency_specified,
            phantom_references=formation_result.phantom_references,
            mismatched_sections=formation_result.mismatched_sections,
            tax_gap_detected=formation_result.tax_gap_detected,
            formation_deductions=formation_result.total_deduction,
            readiness_blocked=readiness_blocked
        )
    
    # ============================================================
    # DETECTION METHODS
    # ============================================================
    
    def _check_indemnification(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['indemnification']
        
        # Check if an AFFIRMATIVE indemnification obligation exists.
        # A bare "no indemnification" / "shall not indemnify" must not count.
        has_indemnification = self._has_affirmative_indemnification(text)
        
        if not has_indemnification:
            findings.append(RiskFinding(
                rule="missing_framework",
                deduction=deductions['missing_framework']['deduction'],
                description=deductions['missing_framework']['description'],
                severity=deductions['missing_framework']['severity'],
                suggestion="Add Article X: Indemnification with caps, baskets, and survival"
            ))
        else:
            # Check for cap
            cap_patterns = self.patterns.get('indemnification', {}).get('cap_patterns', [])
            has_cap = any(p.search(text) for p in cap_patterns)
            if not has_cap:
                findings.append(RiskFinding(
                    rule="missing_cap_only",
                    deduction=deductions['missing_cap_only']['deduction'],
                    description=deductions['missing_cap_only']['description'],
                    severity="high",
                    suggestion="Add indemnification cap (typically 10-50% of purchase price)"
                ))
            
            # Check for basket
            basket_patterns = self.patterns.get('indemnification', {}).get('basket_patterns', [])
            has_basket = any(p.search(text) for p in basket_patterns)
            if not has_basket:
                findings.append(RiskFinding(
                    rule="missing_basket_only",
                    deduction=deductions['missing_basket_only']['deduction'],
                    description=deductions['missing_basket_only']['description'],
                    severity="medium",
                    suggestion="Add de minimis and basket thresholds"
                ))
            
            # Check for survival
            survival_patterns = self.patterns.get('indemnification', {}).get('survival_patterns', [])
            has_survival = any(p.search(text) for p in survival_patterns)
            if not has_survival:
                findings.append(RiskFinding(
                    rule="missing_survival_only",
                    deduction=deductions['missing_survival_only']['deduction'],
                    description=deductions['missing_survival_only']['description'],
                    severity="high",
                    suggestion="Add survival period for reps (typically 12-24 months)"
                ))
        
        return findings

    def _check_indemnity_economics(self, text: str) -> List[RiskFinding]:
        """
        Detect a PRESENT-BUT-DEFECTIVE indemnity framework — the case the
        generic presence checks miss. Catches: basket >= cap (recovery
        nullified), sub-market survival, and missing fundamental/tax/fraud
        carve-outs. This is the core nullification check the interaction
        stack keys on.
        """
        findings = []
        ded = self.config['deductions']['indemnification']

        # ── Cap vs basket magnitude ────────────────────────────────────────
        cap_m = re.search(r"(?:aggregate\s+)?cap\s+of\s*([\d.]+)\s*%", text, re.IGNORECASE)
        basket_m = re.search(r"(?:tipping\s+)?basket\s+of\s*([\d.]+)\s*%", text, re.IGNORECASE)
        if cap_m and basket_m:
            cap_pct = float(cap_m.group(1))
            basket_pct = float(basket_m.group(1))
            if basket_pct >= cap_pct:
                findings.append(RiskFinding(
                    rule="indemnity_cap_below_basket",
                    deduction=ded['cap_below_basket']['deduction'],
                    description=(
                        f"Indemnity basket ({basket_pct}%) meets/exceeds cap ({cap_pct}%) — "
                        "for a tipping basket, losses must exceed the basket before any recovery, "
                        "but recovery is then capped below that threshold, so $0 is recoverable"
                    ),
                    severity=ded['cap_below_basket']['severity'],
                    suggestion="Set basket (0.5-1% deductible) strictly below cap (15-20% general); "
                               "never let the basket threshold sit above the cap"
                ))

        # ── Survival period (days) ─────────────────────────────────────────
        surv_m = re.search(
            r"survival period of\s*(?:[a-z]+\s*\(?\s*(\d+)\s*\)?\s*days|\(\s*(\d+)\s*\)\s*days)",
            text, re.IGNORECASE,
        )
        days = None
        if surv_m:
            days = int(surv_m.group(1) or surv_m.group(2))
        if days is not None and days < 365:
            findings.append(RiskFinding(
                rule="survival_period_too_short",
                deduction=ded['survival_too_short']['deduction'],
                description=(
                    f"Indemnity survival only {days} days — below market 12-24 months general; "
                    "fundamental reps should survive indefinitely and tax to SOL+60 days"
                ),
                severity=ded['survival_too_short']['severity'],
                suggestion="General 18-24 months; fundamental indefinite; tax to statute of limitations + 60 days"
            ))

        # ── Cap applied to fundamental AND tax (no carve-out) ──────────────
        if re.search(
            r"applicable to all claims, including fundamental and tax", text, re.IGNORECASE
        ) or re.search(r"cap.*all claims.*including fundamental and tax", text, re.IGNORECASE):
            findings.append(RiskFinding(
                rule="fundamental_tax_in_cap",
                deduction=ded['fundamental_tax_in_cap']['deduction'],
                description=(
                    "Cap expressly applies to fundamental AND tax reps — no carve-out; "
                    "market standard caps fundamental at 100% of EV and excludes tax entirely"
                ),
                severity=ded['fundamental_tax_in_cap']['severity'],
                suggestion="Carve fundamental reps (cap = EV) and tax (uncapped) out of the general cap"
            ))

        # ── Fraud carve-out absence ────────────────────────────────────────
        # Only flag when the draft AFFIRMATIVELY sweeps fraud under the cap
        # (e.g. "all claims" language). Merely omitting an explicit carve-out
        # in an otherwise standard agreement is not penalized, to avoid
        # false positives on well-drafted deals.
        if cap_m and re.search(r"all claims", text, re.IGNORECASE) and not re.search(
            r"fraud (?:carve[- ]?out|excluded|not subject|uncapped|outside)",
            text, re.IGNORECASE,
        ):
            findings.append(RiskFinding(
                rule="no_fraud_carveout",
                deduction=ded['no_fraud_carveout']['deduction'],
                description=(
                    "Cap language ('all claims') affirmatively sweeps fraud under the "
                    "indemnity cap/basket/survival — contractual fraud recovery is itself capped"
                ),
                severity=ded['no_fraud_carveout']['severity'],
                suggestion="Add: caps, basket, and survival shall not apply to fraud or intentional misrepresentation"
            ))

        return findings

    def _check_earnout(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['earnout']
        
        # Check if earnout exists
        patterns = self.patterns.get('earnout', {}).get('present_patterns', [])
        has_earnout = any(p.search(text) for p in patterns)
        
        if has_earnout:
            # Check for defined metrics
            metric_patterns = self.patterns.get('earnout', {}).get('metric_patterns', [])
            has_metrics = any(p.search(text) for p in metric_patterns)
            
            if not has_metrics:
                findings.append(RiskFinding(
                    rule="undefined_metrics",
                    deduction=deductions['undefined_metrics']['deduction'],
                    description=deductions['undefined_metrics']['description'],
                    severity=deductions['undefined_metrics']['severity'],
                    suggestion="Define specific metrics: Revenue, EBITDA, Gross Profit, or Net Income targets"
                ))
            
            # Check for dispute resolution
            dispute_patterns = self.patterns.get('earnout', {}).get('dispute_patterns', [])
            has_dispute_resolution = any(p.search(text) for p in dispute_patterns)
            if not has_dispute_resolution:
                findings.append(RiskFinding(
                    rule="missing_dispute_resolution",
                    deduction=deductions['missing_dispute_resolution']['deduction'],
                    description=deductions['missing_dispute_resolution']['description'],
                    severity="medium",
                    suggestion="Add earnout dispute resolution (independent accountant or arbitration)"
                ))
        
        return findings
    
    def _check_termination(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['termination']
        
        # Check for outside date
        patterns = self.patterns.get('termination', {}).get('outside_date_patterns', [])
        has_outside_date = any(p.search(text) for p in patterns)
        if not has_outside_date:
            findings.append(RiskFinding(
                rule="missing_outside_date",
                deduction=deductions['missing_outside_date']['deduction'],
                description=deductions['missing_outside_date']['description'],
                severity=deductions['missing_outside_date']['severity'],
                suggestion="Add outside closing date (typically 3-6 months from signing)"
            ))
        
        # Check for termination clause
        patterns = self.patterns.get('termination', {}).get('termination_clause_patterns', [])
        has_termination = any(p.search(text) for p in patterns)
        if not has_termination:
            findings.append(RiskFinding(
                rule="missing_termination_clause",
                deduction=deductions['missing_termination_clause']['deduction'],
                description=deductions['missing_termination_clause']['description'],
                severity=deductions['missing_termination_clause']['severity'],
                suggestion="Add Section X: Termination (mutual consent, material breach, outside date)"
            ))
        
        return findings
    
    def _check_reps_and_warranties(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['representations_and_warranties']
        
        # Check for weasel words
        patterns = self.patterns.get('weasel_words', {}).get('patterns', [])
        weasel_words_found = []
        for pattern in patterns:
            if pattern.search(text):
                weasel_words_found.append(pattern.pattern)
        
        if weasel_words_found:
            findings.append(RiskFinding(
                rule="weasel_words_present",
                deduction=deductions['weasel_words_present']['deduction'],
                description=f"Weak qualifiers: {', '.join(weasel_words_found[:3])}",
                severity=deductions['weasel_words_present']['severity'],
                suggestion="Replace 'no known' with actual knowledge qualifier; remove 'substantial' from compliance"
            ))
        
        return findings
    
    def _check_assumption_of_liabilities(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['assumption_of_liabilities']
        
        # Look for automatic assumption language
        assumption_patterns = [
            r"all material contracts.*shall be assumed",
            r"assume.*all.*liabilities",
            r"assumption of all (?:material )?contracts"
        ]
        
        for pattern in assumption_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                findings.append(RiskFinding(
                    rule="automatic_assumption_no_review",
                    deduction=deductions['automatic_assumption_no_review']['deduction'],
                    description=deductions['automatic_assumption_no_review']['description'],
                    severity=deductions['automatic_assumption_no_review']['severity'],
                    suggestion="Add buyer right to review and exclude problematic contracts before closing"
                ))
                break
        
        return findings
    
    def _check_definitions(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['definitions']
        
        required_defs = self.config['detection_patterns']['definitions']['required']
        missing_defs = []
        
        for def_item in required_defs:
            pattern = re.compile(def_item['pattern'], re.IGNORECASE)
            if not pattern.search(text):
                missing_defs.append(def_item['name'])
        
        if len(missing_defs) >= self.config['deductions']['definitions'].get('multiple_definitions_missing', {}).get('threshold', 3):
            findings.append(RiskFinding(
                rule="multiple_definitions_missing",
                deduction=self.config['deductions']['definitions']['multiple_definitions_missing']['additional_deduction'],
                description=f"Missing definitions: {', '.join(missing_defs)}",
                severity="high",
                suggestion=f"Add definitions for: {', '.join(missing_defs)}"
            ))
        elif missing_defs:
            for def_name in missing_defs:
                deduction_key = f"missing_{def_name.lower().replace(' ', '_')}_definition"
                if deduction_key in deductions:
                    findings.append(RiskFinding(
                        rule=deduction_key,
                        deduction=deductions[deduction_key]['deduction'],
                        description=f"Missing definition: {def_name}",
                        severity="medium",
                        suggestion=f"Add definition for {def_name}"
                    ))
        
        return findings
    
    def _check_boilerplate(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['boilerplate']
        
        # Check for entire agreement
        if not re.search(r"entire agreement|complete agreement|integrated agreement", text, re.IGNORECASE):
            findings.append(RiskFinding(
                rule="missing_entire_agreement",
                deduction=deductions['missing_entire_agreement']['deduction'],
                description=deductions['missing_entire_agreement']['description'],
                severity="low",
                suggestion="Add entire agreement clause to prevent extrinsic evidence"
            ))
        
        # Check for amendment/waiver
        if not re.search(r"amendment|waiver|modification", text, re.IGNORECASE):
            findings.append(RiskFinding(
                rule="missing_amendment_waiver",
                deduction=deductions['missing_amendment_waiver']['deduction'],
                description=deductions['missing_amendment_waiver']['description'],
                severity="low",
                suggestion="Add amendment and waiver clause requiring written consent"
            ))
        
        # Check for governing law
        if not re.search(r"governed by|governing law", text, re.IGNORECASE):
            findings.append(RiskFinding(
                rule="missing_governing_law",
                deduction=deductions['missing_governing_law']['deduction'],
                description=deductions['missing_governing_law']['description'],
                severity="high",
                suggestion="Add governing law provision (e.g., Delaware or New York for US deals)"
            ))
        
        return findings
    
    def _check_contradictions(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['contradictions']
        
        # Check diligence vs investigations contradiction
        due_diligence_complete = re.search(r"due diligence.*complete|no further.*disclosures.*required", text, re.IGNORECASE)
        ongoing_investigations = re.search(r"ongoing investigation|Schedule 14\(c\)", text, re.IGNORECASE)
        
        if due_diligence_complete and ongoing_investigations:
            findings.append(RiskFinding(
                rule="diligence_vs_investigations",
                deduction=deductions['diligence_vs_investigations']['deduction'],
                description=deductions['diligence_vs_investigations']['description'],
                severity=deductions['diligence_vs_investigations']['severity'],
                suggestion="Either complete investigations before signing or remove 'no further disclosures' language"
            ))
        
        return findings
    
    def _check_operational_risks(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['operational_risks']
        
        # Check employee retention period
        retention_match = re.search(r"retained.*for (?:a minimum of )?(\d+)\s*days?", text, re.IGNORECASE)
        if retention_match:
            days = int(retention_match.group(1))
            if days < 90:
                findings.append(RiskFinding(
                    rule="employee_retention_short",
                    deduction=deductions['employee_retention_short']['deduction'],
                    description=f"Employee retention period: {days} days (industry standard 90-180 days)",
                    severity="medium",
                    suggestion="Extend retention to 90-180 days with change-of-control bonuses for key employees"
                ))
        
        # Check data integrity acknowledgment
        if re.search(r"data.*may no longer be recoverable|server migration", text, re.IGNORECASE):
            findings.append(RiskFinding(
                rule="data_integrity_acknowledgment",
                deduction=deductions['data_integrity_acknowledgment']['deduction'],
                description=deductions['data_integrity_acknowledgment']['description'],
                severity="high",
                suggestion="Require data backup certification or adjust valuation downward"
            ))
        
        return findings
    
    def _check_covenants(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['covenants']
        
        # Check for affirmative covenants (conduct of business)
        covenant_patterns = [
            r"conduct of business",
            r"ordinary course",
            r"operate.*in the ordinary course",
            r"interim covenant"
        ]
        
        has_covenants = any(re.search(p, text, re.IGNORECASE) for p in covenant_patterns)
        if not has_covenants:
            findings.append(RiskFinding(
                rule="no_affirmative_covenants",
                deduction=deductions['no_affirmative_covenants']['deduction'],
                description=deductions['no_affirmative_covenants']['description'],
                severity="medium",
                suggestion="Add pre-closing covenants requiring ordinary course operations and consent for material actions"
            ))
        
        return findings
    
    def _check_escrow_and_security(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['escrow_and_security']
        
        has_escrow = re.search(r"escrow|holdback|hold[ -]back", text, re.IGNORECASE)
        has_indemnity = self._has_affirmative_indemnification(text)
        
        if not has_escrow and not has_indemnity:
            findings.append(RiskFinding(
                rule="no_escrow_no_indemnity",
                deduction=deductions['no_escrow_no_indemnity']['deduction'],
                description=deductions['no_escrow_no_indemnity']['description'],
                severity="critical",
                suggestion="Add escrow (typically 10-15% of purchase price) AND indemnification clause"
            ))
        
        return findings
    
    def _check_documentation_quality(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['documentation_quality']
        
        # Check for duplicate sections
        lines = text.lower().split('\n')
        section_headers = [l.strip() for l in lines if re.match(r'^##?\s+\d+\.', l)]
        duplicates = [h for h in section_headers if section_headers.count(h) > 1]
        
        if duplicates:
            findings.append(RiskFinding(
                rule="duplicate_sections",
                deduction=deductions['duplicate_sections']['deduction'],
                description=f"Duplicate section headers: {', '.join(set(duplicates[:3]))}",
                severity="low",
                suggestion="Remove duplicate sections and finalize document formatting"
            ))
        
        # Check for missing schedules — capture FULL sub-numbering
        # (e.g. "1.1(a)", "2.5", "3.11"), not just the leading integer.
        schedule_refs = re.findall(
            r"(?:Schedule|Exhibit|Annex|Appendix)\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))?|[A-Z]+(?:-\d+)?)",
            text,
            re.IGNORECASE,
        )
        if schedule_refs:
            # This is a simplification; real check would verify existence
            findings.append(RiskFinding(
                rule="missing_schedules_referenced",
                deduction=min(deductions['missing_schedules_referenced']['deduction'], 
                            len(schedule_refs) * deductions['missing_schedules_referenced'].get('per_schedule_missing', 1)),
                description=f"{len(schedule_refs)} schedules referenced but not provided: {', '.join(schedule_refs[:5])}",
                severity="high",
                suggestion="Complete all referenced schedules before signing"
            ))
        return findings

    def _check_party_integrity(self, text: str) -> List[RiskFinding]:
        """
        Execution-readiness / obligor-integrity gate. Emits the configured
        party_integrity findings (ghost_obligor, party_label_inconsistency,
        undefined_controlling_terms).

        Design note: shorthand / fixture documents that define NO parties at
        all are skipped rather than penalized, so conventional indemnitor labels
        ("Seller") in an otherwise-good draft do not produce false positives.
        The rule only fires once a party role IS defined, then checks that every
        operative obligor maps to a defined party (or a same-side alias).
        """
        findings = []
        ded = self.config['deductions'].get('party_integrity', {})

        # Defined short names from "X Inc. ("Y")" or ("Y")
        defined_shorts = set(re.findall(r'\(["\']?([A-Z][A-Za-z]+)["\']?\)', text))

        party_roles = {"Buyer", "Seller", "Target", "Purchaser", "Acquirer",
                       "Vendor", "Company", "Borrower", "Lender", "Guarantor"}
        defined_party_roles = {d for d in defined_shorts if d in party_roles}
        if not defined_party_roles:
            return findings  # no defined party to judge against — skip

        seller_side = {"Seller", "Target", "Vendor"}
        buyer_side = {"Buyer", "Purchaser", "Acquirer"}

        # Obligor named in an operative clause.
        obligor_m = re.search(r"([A-Z][A-Za-z]+)\s+shall\s+(?:indemnify|guarantee|hold harmless)", text)
        if obligor_m:
            obligor = obligor_m.group(1)
            norm = re.sub(r"(?i)\b(?:co|inc|corp|llc|ltd)\b\.?", "", obligor).strip()
            if norm in defined_party_roles:
                pass  # obligor is a defined party — OK
            elif (norm in seller_side and defined_party_roles & seller_side) or \
                 (norm in buyer_side and defined_party_roles & buyer_side):
                # Same side, different label (e.g. indemnitor "Seller" but
                # defined party "Target") — ambiguous obligor, fixable.
                findings.append(RiskFinding(
                    rule="party_label_inconsistency",
                    deduction=ded.get('party_label_inconsistency', {}).get('deduction', 15),
                    description=(
                        f"Operative clause names obligor '{obligor}' but the defined party is "
                        f"'{sorted(defined_party_roles)[0]}' — ambiguous which entity owes the "
                        "obligation; align the labels or define 'Seller'"
                    ),
                    severity=ded.get('party_label_inconsistency', {}).get('severity', 'high'),
                    suggestion="Use one consistent label for each party throughout, and define the "
                               "obligor explicitly in the parties/definitions section"
                ))
            else:
                findings.append(RiskFinding(
                    rule="ghost_obligor",
                    deduction=ded.get('ghost_obligor', {}).get('deduction', 30),
                    description=(
                        f"Obligor '{obligor}' imposes an obligation but is not a defined party "
                        f"(defined: {', '.join(sorted(defined_party_roles))}) — the obligation "
                        "runs to a party that does not exist as a defined entity and is illusory"
                    ),
                    severity=ded.get('ghost_obligor', {}).get('severity', 'critical'),
                    suggestion="Define the obligor (Target or its shareholders) in the parties/definitions "
                               "and have it execute the agreement"
                ))

        # Undefined controlling terms referenced in operative caps/obligations
        # (flagged only when the term appears Capitalized as a defined-term style).
        for term in ("Fundamental Representations", "Losses", "Knowledge"):
            if re.search(rf"\b{re.escape(term)}\b", text) and not re.search(
                rf'["\']?{re.escape(term)}["\']?\s*(?:means|defined as|shall mean)', text, re.IGNORECASE
            ):
                findings.append(RiskFinding(
                    rule="undefined_controlling_terms",
                    deduction=ded.get('undefined_controlling_terms', {}).get('deduction', 15),
                    description=f"Controlling term '{term}' is used but never defined",
                    severity=ded.get('undefined_controlling_terms', {}).get('severity', 'high'),
                    suggestion=f"Add a definition for '{term}'"
                ))

        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # INDEMNIFICATION PROCEDURES (notice / defense / settlement consent)
    # ─────────────────────────────────────────────────────────────────────────
    def _check_indemnification_procedures(self, text: str) -> List[RiskFinding]:
        findings = []
        if not self._has_affirmative_indemnification(text):
            return findings
        has_procedures = (
            re.search(r"notice\s+of\s+(?:claim|loss|demand)", text, re.IGNORECASE)
            or re.search(r"\bindemnifying\s+party\b.{0,40}\b(?:defend|control)\b", text, re.IGNORECASE)
            or re.search(r"consent\s+to\s+settlement", text, re.IGNORECASE)
            or re.search(r"settlement\b.{0,60}\bconsent\b", text, re.IGNORECASE)
        )
        if not has_procedures:
            findings.append(RiskFinding(
                rule="indemnification_procedures_missing",
                deduction=self.config['deductions'].get('party_integrity', {}).get('indemnification_procedures', {}).get('deduction', 15),
                description="Indemnification is referenced but no notice-of-claim, defense-control, or settlement-consent procedure is specified — recoverability mechanics are undefined.",
                severity="high",
                suggestion="Add indemnification claim procedures: notice period, defense/control of third-party claims, and settlement-consent mechanics."
            ))
        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # ESCROW vs SURVIVAL MISMATCH
    # ─────────────────────────────────────────────────────────────────────────
    def _parse_months(self, src: str, pattern: str):
        m = re.search(pattern, src, re.IGNORECASE)
        if not m:
            return None
        if m.group(2) is not None:
            try:
                return int(m.group(2))
            except ValueError:
                return None
        word = (m.group(1) or "").lower()
        table = {"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"eighteen":18,"twenty":20,"thirty":30}
        return table.get(word)

    def _check_escrow_survival_mismatch(self, text: str) -> List[RiskFinding]:
        findings = []
        escrow = self._parse_months(
            text,
            r"\bescrow\b[^.]{0,80}?(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\b|(\d{1,2}))\s*[- ]?(?:month|mo)"
        )
        survival = self._parse_months(
            text,
            r"\b(?:indemnification|survival)[^.]{0,80}?(?:period|survive)[^.]{0,80}?(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\b|(\d{1,2}))\s*[- ]?(?:month|year|yr|mo)"
        )
        if escrow is not None and survival is not None and escrow < survival:
            fraud_unlimited = bool(re.search(r"\bfraud\b[^.]{0,80}?\b(?:no|without)\b[^.]{0,60}\b(?:limitation|cap|survival)\b", text, re.IGNORECASE) or re.search(r"\b(?:no|without)\s+limitation\b[^.]{0,40}?\bfraud\b", text, re.IGNORECASE))
            findings.append(RiskFinding(
                rule="escrow_survival_mismatch",
                deduction=self.config['deductions'].get('party_integrity', {}).get('escrow_survival_mismatch', {}).get('deduction', 20),
                description=(
                    f"Indemnity escrow ({escrow} months) releases before the indemnity survival period "
                    f"({survival} months), leaving post-release claims unrecoverable from the escrow."
                    + (" Fraud is stated to be unlimited while the escrow is time-limited — align escrow release to the fraud/unlimited tail or add a RWI/guaranty backstop." if fraud_unlimited else "")
                ),
                severity="high",
                suggestion="Extend escrow release to match the longest survival tail (or carve fraud from the escrow release), or add RWI/guaranty backstop."
            ))
        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # UNDEFINED CONTROLLING TERMS
    # ─────────────────────────────────────────────────────────────────────────
    def _check_controlling_terms(self, text: str) -> List[RiskFinding]:
        findings = []
        controlling = ["Seller", "Purchase Price", "Closing", "Effective Time", "Outside Date",
                       "Earnout Period", "Fundamental Representations", "Net Working Capital",
                       "Balance Sheet Date", "Survival Period", "Indemnification"]
        title_case = {"Closing", "Indemnification", "Purchase Price", "Effective Time", "Outside Date",
                      "Earnout Period", "Net Working Capital", "Balance Sheet Date", "Survival Period"}
        defined = set()
        # "Term" means ...  definitions
        for m in re.finditer(r"[\"']([A-Z][-&/\w ]{2,50})[\"']\s+(?:means|shall mean|is defined as|refers to|being)", text, re.IGNORECASE):
            defined.add(m.group(1).strip().lower())
        # Preamble role bindings:  Acquiror Inc. ('Buyer')
        for m in re.finditer(r"\b([A-Z][\w&.',\- ]{2,40})\s*\(\s*[\"']?([A-Za-z][A-Za-z ]{1,40})[\"']?\s*\)", text):
            entity, role = m.group(1).strip(), m.group(2).strip()
            if re.search(r"inc\.?|corp\.?|llc|l\.l\.c\.?|ltd\.?|lp\b|plc|gmbh|s\.a\.?|n\.v\.?|company|co\.?|holdings?|group", entity, re.IGNORECASE):
                defined.add(role.lower())
            else:
                defined.add(entity.lower())
        undefined = []
        for ct in controlling:
            if ct in title_case or ct.lower() in defined:
                continue
            if re.search(r"\b" + re.escape(ct) + r"\b", text, re.IGNORECASE):
                undefined.append(ct)
        if undefined:
            findings.append(RiskFinding(
                rule="undefined_controlling_terms",
                deduction=self.config['deductions'].get('party_integrity', {}).get('undefined_controlling_terms', {}).get('deduction', 15),
                description=f"Controlling defined terms referenced but not defined: {', '.join(undefined)}. The operative text is unenforceable as drafted.",
                severity="high",
                suggestion="Add a Definitions article defining each controlling term before relying on the agreement."
            ))
        return findings

    def _check_readiness_gate(self, text: str, findings: List[RiskFinding]) -> bool:
        """Returns True when the deal is NOT execution-ready (score must be capped)."""
        blockers = [f for f in findings if f.rule in ("ghost_obligor", "undefined_controlling_terms")]
        # Missing referenced operative documents (Plan of Merger / Disclosure Schedules)
        refs = set(re.findall(r"\b(?:Plan\s+of\s+Merger|Disclosure\s+Schedules?)\b", text, re.IGNORECASE))
        missing = [r for r in refs if not re.search(re.escape(r) + r"\b[\s\S]{0,40}[:=]", text, re.IGNORECASE)
                   and not re.search(re.escape(r) + r"\b[^.]{0,30}\b(?:means|set\s+forth|attached|annexed)", text, re.IGNORECASE)]
        return bool(blockers) or bool(missing)


    # ─────────────────────────────────────────────────────────────────────────
    # NEGATION-AWARE INDEMNITY PRESENCE
    # ─────────────────────────────────────────────────────────────────────────
    def _has_affirmative_indemnification(self, text: str) -> bool:
        """True only when the text imposes an indemnity obligation.

        A clause that says 'no indemnification' or 'shall not indemnify' must NOT
        be read as an indemnity being present (the old bug turned
        'There shall be no indemnification' into a cap-less indemnity, and hid
        the real risk: Buyer assuming all liabilities).
        """
        if _NEGATION_RE.search(text):
            return False
        return bool(re.search(r"indemnif|hold\s+harmless", text, re.IGNORECASE))

    # ─────────────────────────────────────────────────────────────────────────
    # AFFIRMATIVE LIABILITY ASSUMPTION (DNP / "known and unknown")
    # ─────────────────────────────────────────────────────────────────────────
    def _check_liability_assumption(self, text: str) -> List[RiskFinding]:
        findings = []
        if re.search(r"accepts?\s+all\s+liabilit", text, re.IGNORECASE) and \
           re.search(r"known\s+and\s+unknown", text, re.IGNORECASE):
            ded = self.config['deductions'].get('deal_protections', {}).get(
                'unlimited_liability_assumption', {})
            findings.append(RiskFinding(
                rule="unlimited_liability_assumption",
                deduction=ded.get('deduction', 25),
                description=ded.get(
                    'description',
                    "Buyer affirmatively assumes all Target liabilities, known AND unknown, "
                    "with no indemnification — unlimited, unquantifiable exposure "
                    "(tax, litigation, environmental, pension, employment)."),
                severity=ded.get('severity', 'critical'),
                suggestion=ded.get(
                    'suggestion',
                    "Add reps + indemnification with cap/basket, or (if intentional) "
                    "explicitly quantify and disclose the assumed liabilities."),
            ))
        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # TERMINATION ASYMMETRY
    # ─────────────────────────────────────────────────────────────────────────
    def _check_termination_asymmetry(self, text: str) -> List[RiskFinding]:
        findings = []
        seller_term = re.search(
            r"(seller|target).{0,80}terminate.{0,80}(convenience|any time|sole discretion)",
            text, re.IGNORECASE)
        buyer_term = re.search(
            r"buyer.{0,120}terminate.{0,120}(fraud|judicial|final)", text, re.IGNORECASE)
        if seller_term and buyer_term:
            ded = self.config['deductions'].get('deal_protections', {}).get(
                'termination_asymmetry', {})
            findings.append(RiskFinding(
                rule="termination_asymmetry",
                deduction=ded.get('deduction', 20),
                description=ded.get(
                    'description',
                    "Termination rights are asymmetric: seller may exit for convenience, "
                    "buyer only on a final fraud adjudication — no deal certainty for buyer."),
                severity=ded.get('severity', 'critical'),
                suggestion=ded.get(
                    'suggestion',
                    "Mirror termination rights, or grant buyer an MAE/fiduciary walk right."),
            ))
        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # RELIANCE / DILIGENCE-RECOURSE WAIVERS
    # ─────────────────────────────────────────────────────────────────────────
    def _check_reliance_waiver(self, text: str) -> List[RiskFinding]:
        findings = []
        ded = self.config['deductions'].get('deal_protections', {})
        if re.search(r"as\s+is,?\s*where\s+is", text, re.IGNORECASE):
            d = ded.get('as_is_waiver', {})
            findings.append(RiskFinding(
                rule="as_is_waiver",
                deduction=d.get('deduction', 12),
                description=d.get('description',
                    "'As is, where is' acceptance strips buyer of reliance on any "
                    "extra-contractual facts."),
                severity=d.get('severity', 'high'),
                suggestion=d.get('suggestion',
                    "Limit as-is to matters covered by the reps; pair with disclosure schedules.")))
        if re.search(r"waives?\s+any\s+recourse\s+for\s+matters\s+discoverable", text, re.IGNORECASE):
            d = ded.get('diligence_recourse_waiver', {})
            findings.append(RiskFinding(
                rule="diligence_recourse_waiver",
                deduction=d.get('deduction', 12),
                description=d.get('description',
                    "Waiver of recourse for diligence-discoverable matters bars even "
                    "known claims — an overbroad seller shield."),
                severity=d.get('severity', 'high'),
                suggestion=d.get('suggestion',
                    "Remove; a diligence waiver should not extinguish fraud or "
                    "known-misrepresentation claims.")))
        return findings

    # ============================================================
    # INTERACTION WEIGHTING
    # ============================================================
    
    def _apply_interaction_weighting(self, text: str, findings: List[RiskFinding]) -> List[Dict]:
        """Apply compounding effects from multiple risks"""
        triggered_stacks = []
        stacks_config = self.config.get('interaction_weighting', {}).get('stacks', {})
        
        # Map findings to conditions
        finding_rules = set(f.rule for f in findings)
        
        for stack_name, stack_config in stacks_config.items():
            conditions_met = all(cond in finding_rules for cond in stack_config.get('conditions', []))
            if conditions_met:
                triggered_stacks.append({
                    "name": stack_config.get('name', stack_name),
                    "compounded_deduction": stack_config.get('compounded_deduction', 0),
                    "description": stack_config.get('description', '')
                })
        
        return triggered_stacks
    
    # ============================================================
    # UTILITY METHODS
    # ============================================================
    
    def _detect_skeleton_draft(self, text: str) -> bool:
        """Determine if document is a skeleton/Tier 1 draft"""
        skeleton_indicators = [
            len(text.split()) < 2000,  # Short document
            text.count("Schedule") > text.count("Exhibit"),  # Missing attachments
            "SAMPLE" in text or "DRAFT" in text,
            text.count("§") < 5  # Few sections
        ]
        return sum(skeleton_indicators) >= 2
    
    def _get_risk_level(self, score: int) -> Tuple[str, str]:
        """Get risk level and recommendation from score"""
        levels = self.config['risk_levels']
        for level_name, level_config in levels.items():
            range_min, range_max = level_config['score_range']
            if range_min <= score <= range_max:
                return level_config['label'], level_config['recommendation']
        return "🔴 Unknown", "Review manually"
    
    def _get_arbitration_threshold(self, text: str) -> Optional[Dict]:
        """Extract arbitration jurisdiction and return cost threshold"""
        thresholds = self.config.get('arbitration_cost_thresholds', {}).get('thresholds', {})
        
        # Look for arbitration location
        for location in thresholds.keys():
            if re.search(location, text, re.IGNORECASE):
                return {
                    "jurisdiction": location,
                    "min_claim_usd": thresholds[location]['min_claim_usd'],
                    "description": thresholds[location]['description']
                }
        
        # Default if found arbitration but no location
        if re.search(r"arbitration", text, re.IGNORECASE):
            return {
                "jurisdiction": "unknown",
                "min_claim_usd": thresholds.get('default', {}).get('min_claim_usd', 250000),
                "description": thresholds.get('default', {}).get('description', 'Unknown jurisdiction – assume ~$250k minimum')
            }
        
        return None
    
    def _identify_strengths(self, findings: List[RiskFinding], text: str) -> List[str]:
        """Identify what the analyzer caught correctly"""
        strengths = []
        
        # Map findings to human-readable strengths
        strength_map = {
            "undefined_metrics": "✅ Earnout litigation risk identified",
            "weasel_words_present": "✅ Weak reps ('weasel words') flagged",
            "diligence_vs_investigations": "✅ Contradiction detection (diligence vs investigations)",
            "missing_framework": "✅ Indemnification gap correctly identified",
            "missing_termination_clause": "✅ Missing termination clause flagged",
            "missing_outside_date": "✅ Missing outside date flagged"
        }
        
        for finding in findings:
            if finding.rule in strength_map:
                strengths.append(strength_map[finding.rule])
        
        # Add arbitration threshold if detected
        if self._get_arbitration_threshold(text):
            strengths.append("✅ Arbitration cost realism applied")
        
        return list(set(strengths))  # Remove duplicates
    
    def _identify_missed_items(self, text: str) -> List[str]:
        """Identify what the analyzer might have missed (training feedback)"""
        missed = []
        feedback_config = self.config.get('training_feedback', {}).get('missing_boilerplate_alerts', [])
        
        for item in feedback_config:
            # Check if this item exists in document
            pattern = item.get('pattern', item['clause_type'].replace('_', ' '))
            if not re.search(pattern, text, re.IGNORECASE):
                missed.append(item['message'])
        
        # Limit to 5 most important
        return missed[:5]
    
    def _prioritize_must_fix(self, findings: List[RiskFinding]) -> List[Dict]:
        """Prioritize top must-fix items"""
        # Sort by deduction amount (highest first)
        sorted_findings = sorted(findings, key=lambda x: x.deduction, reverse=True)
        
        must_fix = []
        for finding in sorted_findings[:5]:  # Top 5
            if finding.deduction >= 5:  # Only include significant issues
                must_fix.append({
                    "rule": finding.rule,
                    "description": finding.description,
                    "suggestion": finding.suggestion,
                    "severity": finding.severity
                })
        
        return must_fix
    
    def _calculate_adjusted_score(self, current_score: int, must_fix_items: List[Dict]) -> int:
        """Calculate score if top must-fix items are addressed"""
        # If all critical fixes applied, add back ~70% of lost points
        if len(must_fix_items) >= 3:
            critical_fixes_applied = any(item['severity'] == 'critical' for item in must_fix_items[:3])
            if critical_fixes_applied:
                return min(100, current_score + 60)
        
        return min(100, current_score + 40)
    
    def format_output(self, result: AnalysisResult) -> str:
        """Format analysis result as beautiful scorecard"""
        output = []
        output.append("═══════════════════════════════════════════════════")
        output.append("MERGER AGREEMENT RISK SCORECARD")
        output.append(f"Document: {result.document_name}")
        output.append(f"Analyzed: {result.timestamp}")
        output.append("═══════════════════════════════════════════════════")
        output.append(f"VIABILITY: {result.risk_level}  |  Score: {result.final_score}/100")
        output.append(f"RECOMMENDATION: {result.recommendation}")
        output.append("")
        
        # Top deal-breakers
        output.append("TOP 3 DEAL-BREAKERS:")
        for i, finding in enumerate(result.findings[:3], 1):
            if finding.deduction >= 8:  # Only severe issues
                output.append(f"{i}. {finding.description}")
        output.append("")
        
        output.append("═══════════════════════════════════════════════════")
        output.append("MUST-FIX BEFORE SIGNING (MAX 5)")
        output.append("═══════════════════════════════════════════════════")
        for item in result.must_fix_items:
            severity_icon = "🔴" if item['severity'] == 'critical' else "🟠" if item['severity'] == 'high' else "🟡"
            output.append(f"{severity_icon} {item['description']}")
            output.append(f"   → Fix: {item['suggestion']}")
            output.append("")
        
        output.append("═══════════════════════════════════════════════════")
        output.append("WHAT YOUR ANALYZER CAUGHT WELL")
        output.append("═══════════════════════════════════════════════════")
        for strength in result.strengths[:5]:
            output.append(strength)
        output.append("")
        
        if result.arbitration_threshold:
            output.append(f"📍 Arbitration: {result.arbitration_threshold['jurisdiction'].title()} – Minimum rational claim: ${result.arbitration_threshold['min_claim_usd']:,}")
            output.append("")
        
        output.append("═══════════════════════════════════════════════════")
        output.append("WHAT YOUR ANALYZER MISSED (FEEDBACK FOR TRAINING)")
        output.append("═══════════════════════════════════════════════════")
        for missed in result.missed_items:
            output.append(f"❌ {missed}")
        output.append("")
        
        output.append("═══════════════════════════════════════════════════")
        output.append(f"ADJUSTED SCORE IF FIXES APPLIED: {result.adjusted_score_if_fixed}/100")
        output.append("═══════════════════════════════════════════════════")
        output.append("")
        output.append("═══════════════════════════════════════════════════")
        output.append("FORMATION VALIDITY")
        output.append("═══════════════════════════════════════════════════")
        output.append(f"Merger structure legally operative: {'✅ YES' if result.merger_structure_valid else '❌ NO'}")
        output.append(f"Currency specified: {'✅ YES' if result.currency_specified else '❌ NO'}")
        output.append(f"Tax gap detected: {'❌ YES' if result.tax_gap_detected else '✅ NO'}")
        if result.phantom_references:
            output.append(f"👻 Phantom references ({len(result.phantom_references)}): {', '.join(result.phantom_references[:3])}")
        if result.mismatched_sections:
            output.append(f"⚠️ Mismatched sections: {', '.join(result.mismatched_sections[:5])}")
        output.append(f"Formation deductions applied: {result.formation_deductions} points")
        output.append("")
        
        return "\n".join(output)


# ============================================================
# CLI ENTRY POINT
# ============================================================

def main():
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='M&A Merger Agreement Risk Analyzer')
    parser.add_argument('file', help='Path to document file (.txt or .pdf)')
    parser.add_argument('--config', default='merger_scoring_config.yaml', help='Path to config file')
    parser.add_argument('--output', choices=['text', 'json'], default='text', help='Output format')
    
    args = parser.parse_args()
    
    # Read file
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File {args.file} not found")
        sys.exit(1)
    
    # Extract text (simplified - add PDF extraction as needed)
    if file_path.suffix.lower() == '.pdf':
        # For PDF, you'd need PyPDF2 or similar
        print("PDF support requires additional library. Converting to .txt recommended.")
        sys.exit(1)
    else:
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
    
    # Analyze
    analyzer = MergerRiskAnalyzer(config_path=args.config)
    result = analyzer.analyze(text, document_name=file_path.name)
    
    # Output
    if args.output == 'json':
        import json
        from dataclasses import asdict
        print(json.dumps(asdict(result), indent=2))
    else:
        print(analyzer.format_output(result))

if __name__ == "__main__":
    main()
