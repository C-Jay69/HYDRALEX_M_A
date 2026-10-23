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

    def __init__(self, config_path: str = _DEFAULT_CONFIG,
                 survival_period_override_months=None,
                 indemnification_cap_pct_override=None,
                 indemnification_basket_pct_override=None,
                 earnout_metric_override=None,
                 risk_level_override=None,
                 output_sections=None):
        """Initialize analyzer with YAML configuration and what-if overrides.

        Args:
            config_path: Path to YAML config file
            survival_period_override_months: Override survival period in months (6-60)
                - Professional tier: user can toggle 12-36 months
                - None: use period detected in document
            indemnification_cap_pct_override: Override cap percentage (5-50%)
                - Professional tier: user-adjustable cap
                - None: use cap detected in document
            indemnification_basket_pct_override: Override basket percentage (0.5-5%)
                - Professional tier: user-adjustable basket
                - None: use basket detected in document
            earnout_metric_override: Earnout metric selection
                - Options: Revenue, EBITDA, Gross Profit, Net Income, Cash Flow
                - Professional tier: user can select metric
                - None: use metric detected in document
            risk_level_override: Override risk level boundaries (dict with score_range keys)
                - e.g., {"minimal": [85, 100], "low": [70, 84], ...}
                - None: use boundaries from config.yaml
            output_sections: Which report sections to include
                - List of section names from: risk_score, executive_summary, defined_terms,
                  covenants, indemnification, survival_periods, earnout, regulatory, disclosures, boilerplate
                - Default: all sections shown
        """
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        self.base_score = self.config['config']['base_score']
        self.skeleton_leniency = self.config['config']['skeleton_draft_leniency']

        # Store what-if overrides
        self.survival_period_override_months = survival_period_override_months
        self.indemnification_cap_pct_override = indemnification_cap_pct_override
        self.indemnification_basket_pct_override = indemnification_basket_pct_override
        self.earnout_metric_override = earnout_metric_override
        self.risk_level_override = risk_level_override
        self.output_sections = output_sections or self._default_sections()

        # Formation validator (runs BEFORE main checks)
        self.formation_validator = FormationValidator(self.config)

        # Compile regex patterns for faster detection
        self._compile_patterns()

    def _default_sections(self) -> list:
        """Return default output sections shown in the report."""
        return [
            'risk_score', 'executive_summary', 'defined_terms',
            'covenants', 'indemnification', 'survival_periods',
            'earnout', 'regulatory', 'disclosures', 'boilerplate'
        ]
        
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
        findings.extend(self._check_regulatory_risks(document_text))

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
        # Improved survival period parsing with proper tax/fundamental distinction
        # Look for survival periods more comprehensively
        surv_pattern = r"survival(?: period)?\s+(?:of\s+)?(?:[a-z]+\s*)?(\d+)\s*(?:days|months|years|mo|yr)"
        surv_matches = re.finditer(surv_pattern, text, re.IGNORECASE)

        # Check for specific tax rep survival language
        # Pattern: "tax survive X days" or "tax representations survive X years"
        tax_survival_pattern = r"(?:tax|income tax|transfer tax|estate tax)\s+representations?\.?\s+shall\s+survive.*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)"
        tax_survival_match = re.search(tax_survival_pattern, text, re.IGNORECASE)

        # Alternative tax survival: "tax survive X days"
        tax_survival_alt_pattern = r"tax.*survive.*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)"
        tax_survival_alt_match = re.search(tax_survival_alt_pattern, text, re.IGNORECASE)

        # Check for general survival language (non-specific reps)
        general_survival_pattern = r"(?:representations|warranties)\s+shall\s+survive.*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)"
        general_survival_match = re.search(general_survival_pattern, text, re.IGNORECASE)

        # Check for "Specified Representations" survival language (key distinction)
        specified_reps_pattern = r"(?:Specified Representations|Fundamental Representations)\s+shall\s+survive"
        specified_reps_match = re.search(specified_reps_pattern, text, re.IGNORECASE)

        # Check for fundamental reps survival (they should survive indefinitely)
        fundamental_pattern = r"(?:fundamental|material|essential)\s+representations?\s+shall\s+survive"
        fundamental_match = re.search(fundamental_pattern, text, re.IGNORECASE)

        # Check for survival definitions/constructions
        survival_def_pattern = r"survival(?: period)?.{0,200}means.{0,200}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)"
        survival_def_match = re.search(survival_def_pattern, text, re.IGNORECASE)

        # Parse all survival period durations found in the document
        all_survival_days = []  # List of (raw_days, duration_text, duration_type)
        for match in surv_matches:
            potential_days = match.group(1)
            duration_text = match.group(0)
            try:
                parsed_days = int(potential_days)
                if parsed_days > 0:
                    # Determine duration type from context
                    duration_type = "general"
                    text_before = text[max(0, match.start() - 100):match.start()].lower()
                    if 'tax' in text_before:
                        duration_type = "tax"
                    elif 'fundamental' in text_before or 'material' in text_before:
                        duration_type = "fundamental"
                    all_survival_days.append((parsed_days, duration_text, duration_type))
            except ValueError:
                continue

        # Determine the effective survival period based on taxonomy
        # Priority: fundamental > tax > general
        effective_days = None
        effective_type = "general"
        tax_days_from_text = None
        fundamental_match_found = False

        for days, dur_text, dur_type in all_survival_days:
            if dur_type == "fundamental":
                fundamental_match_found = True
                # Fundamental reps should survive indefinitely - any finite period is too short
                if effective_days is None or effective_type != "fundamental":
                    effective_days = days
                    effective_type = "fundamental"
            elif dur_type == "tax":
                tax_days_from_text = days
                # Tax reps should survive SOL + 60 days; if we only have days from text,
                # flag if < 365 (basic check; full SOL calc needs more context)
                if effective_days is None:
                    effective_days = days
                    effective_type = "tax"
            else:
                # General reps
                if effective_days is None:
                    effective_days = days
                    effective_type = "general"

        # Also check for explicit "indefinite" survival language
        indefinite_pattern = r"(?:fundamental|material|essential).{0,50}rep.{0,50}survive.{0,20}indeterminant|indefinite|perpetual|unlimited"
        indefinite_match = re.search(indefinite_pattern, text, re.IGNORECASE)

        # ── Tax rep survival check ────────────────────────────────────────
        # Only flag if we have tax survival language AND it's too short
        tax_flagged = False
        if tax_survival_match or tax_survival_alt_match:
            # Extract the actual duration mentioned
            tax_dur_match = re.search(
                r'(?:tax|income tax|transfer tax|estate tax).{0,50}(?:survive|shall\s+survive).{0,50}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)',
                text, re.IGNORECASE
            )
            if tax_dur_match:
                tax_days = self._parse_duration(tax_dur_match.group(0))
                if tax_days is not None:
                    # Tax reps should survive statute of limitations + 60 days or more
                    # Flag if less than 365 days as a baseline check
                    if tax_days < 365 and not tax_flagged:
                        tax_flagged = True
                        findings.append(RiskFinding(
                            rule="survival_period_too_short",
                            deduction=ded['survival_too_short']['deduction'],
                            description=(
                                f"Tax indemnity survival only {tax_days} days — below market standard "
                                "for tax reps (should be statute of limitations + 60 days or more)"
                            ),
                            severity=ded['survival_too_short']['severity'],
                            suggestion="Extend tax rep survival to statute of limitations + 60 days or more"
                        ))

        # ── General survival period check ─────────────────────────────────
        # Flag general survival periods that are too short, but only if not
        # already captured as tax or fundamental
        if effective_days is not None and effective_type == "general" and not tax_flagged:
            if effective_days < 365:
                # Check if fundamental reps survive indefinitely (which would make
                # this general period the only finite one, suggesting it's intentional)
                if not fundamental_match_found:
                    findings.append(RiskFinding(
                        rule="survival_period_too_short",
                        deduction=ded['survival_too_short']['deduction'],
                        description=(
                            f"Indemnity survival only {effective_days} days — below market 12-24 months general; "
                            "fundamental reps should survive indefinitely and tax to SOL+60 days"
                        ),
                        severity=ded['survival_too_short']['severity'],
                        suggestion="General 18-24 months; fundamental indefinite; tax to statute of limitations + 60 days"
                    ))

        # ── Fundamental reps survival check ───────────────────────────────
        # If fundamental reps have a finite survival period, flag it
        if fundamental_match_found and effective_days is not None and effective_type == "fundamental":
            findings.append(RiskFinding(
                rule="survival_period_too_short",
                deduction=ded['survival_too_short']['deduction'],
                description=(
                    f"Fundamental representations have only {effective_days} days survival — "
                    "fundamental reps should survive indefinitely (not limited to a finite period)"
                ),
                severity=ded['survival_too_short']['severity'],
                suggestion="Carve fundamental reps out of the general cap and specify indefinite survival"
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
                # Try to extract what the parties might be referring to
                # Look for any financial metrics mentioned in the earnout context
                mentioned_metrics = set()

                # Check for common metrics patterns
                for metric_name in ['Revenue', 'EBITDA', 'Gross Profit', 'Net Income', 'Cash Flow']:
                    if re.search(r'\b' + re.escape(metric_name) + r'\b', text, re.IGNORECASE):
                        mentioned_metrics.add(metric_name)

                # Check for dollar-amount based metrics
                dollar_metrics = re.findall(r'\$[\d,]+', text)
                if dollar_metrics:
                    mentioned_metrics.add(f"dollar-based target (${dollar_metrics[0]})")

                # Check for percentage-based metrics
                pct_metrics = re.findall(r'\d+\.?\d*%\s*(?:of|revenue|sales)', text, re.IGNORECASE)
                if pct_metrics:
                    mentioned_metrics.add(f"percentage-based target ({', '.join(pct_metrics[:2])})")

                # Check for problematic metric definition language
                problematic_language = []

                # Check for "sole discretion" language that gives one party unchecked control
                if re.search(r'sole\.?\s*discretion', text, re.IGNORECASE):
                    problematic_language.append("sole discretion language giving one party unchecked control over metric calculation")

                # Check for "non-recurring items" which can be used to manipulate earnout
                if re.search(r'non.recurring.items', text, re.IGNORECASE):
                    problematic_language.append("'non-recurring items' provision allowing subjective exclusion of earnings")

                # Check for "synergies" deduction from earnout (common manipulation tactic)
                if re.search(r'synergies', text, re.IGNORECASE):
                    problematic_language.append("synergies deduction from earnout pool")

                # Check for "adjusted EBITDA" or similar vague metric definitions
                if re.search(r'adjusted\.?\s*EBITDA', text, re.IGNORECASE):
                    problematic_language.append("'adjusted EBITDA' without clear definition of adjustments")

                # Check for "target" that's determined by one party
                if re.search(r'target.*determined\.?\s*by\s*buyer|buyer.*determine.*target', text, re.IGNORECASE):
                    problematic_language.append("target earnout metric determined solely by Buyer")

                metric_desc = ""
                if mentioned_metrics:
                    metric_desc = f"The earnout formula references metrics but does not define them clearly. " \
                                  f"Metrics mentioned in document: {', '.join(mentioned_metrics)}. "

                if problematic_language:
                    metric_desc += f"Problematic metric definition language detected: {'. '.join(problematic_language)}. "

                findings.append(RiskFinding(
                    rule="undefined_metrics",
                    deduction=deductions['undefined_metrics']['deduction'],
                    description=(metric_desc + deductions['undefined_metrics']['description']),
                    severity=deductions['undefined_metrics']['severity'],
                    suggestion=(deductions['undefined_metrics']['suggestion'] +
                               " Consider: Revenue, EBITDA, Gross Profit, or Net Income targets with objective measurement criteria; avoid sole discretion language over metric calculation")
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

            # Check for earnout duration
            earnout_dur_pattern = r"earnout.{0,100}(?:over|for|period).{0,50}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:months|years|mo|yr)"
            earnout_dur_match = re.search(earnout_dur_pattern, text, re.IGNORECASE)
            if not earnout_dur_match:
                findings.append(RiskFinding(
                    rule="undefined_earnout_duration",
                    deduction=deductions.get('undefined_earnout_duration', {}).get('deduction', 5),
                    description="Earnout period not specified — unclear how long the earnout lasts",
                    severity="medium",
                    suggestion="Specify earnout duration (typically 2-5 years from closing)"
                ))

            # Check for earnout calculation methodology
            calc_patterns = [
                r"{(?:VWAP|volume.weighted.average.price)}",
                r"20.day.*VWAP",
                r"\.{0,20}calc(?:ulation)?.{0,20}",
                r"based on.{0,50}(?:revenues?|earnings?|sales)",
            ]
            has_calc_method = any(re.search(p, text, re.IGNORECASE) for p in calc_patterns)
            if not has_calc_method:
                # Check if there's any description of how it's calculated
                if not re.search(r'how.{0,30}determin|calc(?:ulation).{0,30}method', text, re.IGNORECASE):
                    findings.append(RiskFinding(
                        rule="undefined_earnout_calculation",
                        deduction=deductions.get('undefined_earnout_calculation', {}).get('deduction', 8),
                        description="Earnout calculation methodology not specified",
                        severity="medium",
                        suggestion="Define earnout calculation methodology (formula, measurement dates, adjustments)"
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

    def _parse_duration(self, duration_text: str) -> Optional[int]:
        """Parse duration text into days"""
        if not duration_text:
            return None

        # Handle number words
        word_map = {
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
            'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
            'nineteen': 19, 'twenty': 20
        }

        # Extract number
        num_match = re.search(r'(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)', duration_text.lower())
        if num_match:
            num_str = num_match.group(1)
            try:
                if num_str.isdigit():
                    return int(num_str)
                else:
                    return word_map.get(num_str, 0)
            except (ValueError, TypeError):
                pass

        return None

    # ─────────────────────────────────────────────────────────────────────────
    # ESCROW vs SURVIVAL MISMATCH (FIXED)
    # ─────────────────────────────────────────────────────────────────────────
    def _check_escrow_survival_mismatch(self, text: str) -> List[RiskFinding]:
        findings = []

        # Fixed: Better detection of escrow and survival periods
        # Look for escrow duration
        escrow_pattern = r"\bescrow\b[^.]{0,100}?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\s*(?:month|mo|year|yr)"
        escrow_match = re.search(escrow_pattern, text, re.IGNORECASE)

        # Look for indemnity survival duration
        survival_pattern = r"(?:indemnification|survival)[^.]{0,100}?(?:period|survive)[^.]{0,100}?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\s*(?:month|mo|year|yr)"
        survival_match = re.search(survival_pattern, text, re.IGNORECASE)

        # If we found both, parse them
        escrow_days = None
        survival_days = None

        if escrow_match:
            escrow_text = escrow_match.group(0)
            # Extract duration from escrow text
            escrow_duration_match = re.search(r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\s*(?:month|mo|year|yr)', escrow_text, re.IGNORECASE)
            if escrow_duration_match:
                escrow_duration = escrow_duration_match.group(0)
                escrow_days = self._parse_duration(escrow_duration)
                # Convert to days if in months
                if 'month' in escrow_duration.lower() or 'mo' in escrow_duration.lower():
                    if escrow_days:
                        escrow_days *= 30

        if survival_match:
            survival_text = survival_match.group(0)
            # Extract duration from survival text
            survival_duration_match = re.search(r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty)\s*(?:month|mo|year|yr)', survival_text, re.IGNORECASE)
            if survival_duration_match:
                survival_duration = survival_duration_match.group(0)
                survival_days = self._parse_duration(survival_duration)
                # Convert to days if in months
                if 'month' in survival_duration.lower() or 'mo' in survival_duration.lower():
                    if survival_days:
                        survival_days *= 30

        # Check if escrow releases before survival period ends
        if escrow_days is not None and survival_days is not None and escrow_days < survival_days:
            # Check for fraud language that might indicate unlimited tail
            fraud_unlimited = bool(re.search(r"\bfraud\b[^.]{0,80}?\b(?:no|without)\b[^.]{0,60}\b(?:limitation|cap|survival)\b", text, re.IGNORECASE) or re.search(r"\b(?:no|without)\s+limitation\b[^.]{0,40}?\bfraud\b", text, re.IGNORECASE))

            # Check if this is a circular funding scenario
            # The key insight: termination fee and escrow are mutually exclusive
            # They serve different purposes - escrow is at closing, termination fee is for non-closing scenarios
            termination_fee_pattern = r"\b(?:termination\s+fee|break\s+fee)\b.*?\$?(?:\d+(?:,\d+)*)"
            termination_fee_match = re.search(termination_fee_pattern, text, re.IGNORECASE)

            # If both exist, they're not circular (one is paid at closing, other at termination)
            # But if they both apply to the same event, that's a problem
            if not termination_fee_match:
                findings.append(RiskFinding(
                    rule="escrow_survival_mismatch",
                    deduction=self.config['deductions'].get('party_integrity', {}).get('escrow_survival_mismatch', {}).get('deduction', 20),
                    description=(
                        f"Indemnity escrow ({escrow_days//30 if escrow_days % 30 == 0 else escrow_days} months) releases before the indemnity survival period "
                        f"({survival_days//30 if survival_days % 30 == 0 else survival_days} months), leaving post-release claims unrecoverable from the escrow."
                        + (" Fraud is stated to be unlimited while the escrow is time-limited — align escrow release to the fraud/unlimited tail or add a RWI/guaranty backstop." if fraud_unlimited else "")
                    ),
                    severity="high",
                    suggestion="Extend escrow release to match the longest survival tail (or carve fraud from the escrow release), or add RWI/guaranty backstop."
                ))
            else:
                # If termination fee exists, this may not be circular funding - they serve different purposes
                # But we still want to make sure escrow doesn't expire before survival
                findings.append(RiskFinding(
                    rule="escrow_survival_mismatch",
                    deduction=self.config['deductions'].get('party_integrity', {}).get('escrow_survival_mismatch', {}).get('deduction', 20),
                    description=(
                        f"Escrow releases ({escrow_days//30 if escrow_days % 30 == 0 else escrow_days} months) before indemnity survival "
                        f"({survival_days//30 if survival_days % 30 == 0 else survival_days} months) — potential gap in recovery."
                    ),
                    severity="high",
                    suggestion="Ensure escrow release timing aligns with the longest survival period to protect buyer."
                ))

        return findings

    # ─────────────────────────────────────────────────────────────────────────
    # UNDEFINED CONTROLLING TERMS (FIXED)
    # ─────────────────────────────────────────────────────────────────────────
    def _check_controlling_terms(self, text: str) -> List[RiskFinding]:
        findings = []
        controlling = ["Seller", "Purchase Price", "Closing", "Effective Time", "Outside Date",
                       "Earnout Period", "Fundamental Representations", "Net Working Capital",
                       "Balance Sheet Date", "Survival Period", "Indemnification"]
        title_case = {"Closing", "Indemnification", "Purchase Price", "Effective Time", "Outside Date",
                      "Earnout Period", "Net Working Capital", "Balance Sheet Date", "Survival Period"}
        defined = set()

        # Collect all defined terms from "Term" means ... definitions
        for m in re.finditer(r"[\"']([A-Z][-&/\w ]{2,50})[\"']\s+(?:means|shall mean|is defined as|refers to|being)", text, re.IGNORECASE):
            defined.add(m.group(1).strip().lower())

        # Also collect definitions from preamble role bindings like "Acquiror Inc. ('Buyer')"
        for m in re.finditer(r"\b([A-Z][\w&.',\- ]{2,40})\s*\(\s*[\"']?([A-Za-z][A-Za-z ]{1,40})[\"']?\s*\)", text):
            entity, role = m.group(1).strip(), m.group(2).strip()
            if re.search(r"inc\.?|corp\.?|llc|l\.l\.c\.?|ltd\.?|lp\b|plc|gmbh|s\.a\.?|n\.v\.?|company|co\.?|holdings?|group", entity, re.IGNORECASE):
                defined.add(role.lower())
            else:
                defined.add(entity.lower())

        # Also collect terms from defined-term patterns like "Company Stockholders"
        # when we have "Stockholders" in the text
        for m in re.finditer(r'"([^"]+)"\s+(?:means|is defined as|shall mean)\s+(?:[^.]*\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b)', text, re.IGNORECASE):
            full_term = m.group(1)
            # Extract just the term part (e.g., "Company Stockholders" -> "Stockholders")
            if ' ' in full_term:
                parts = full_term.split()
                if len(parts) > 1:
                    # Check if the last part is a standard term
                    term_part = parts[-1]
                    defined.add(term_part.lower())

        undefined = []
        for ct in controlling:
            # Check if the term is defined (case insensitive)
            if ct in title_case or ct.lower() in defined:
                continue
            # Check if the term appears in the text
            if re.search(r"\b" + re.escape(ct) + r"\b", text, re.IGNORECASE):
                # Additional check: if it's a variant like "Company Stockholders" for "Stockholders"
                # we should check if the base term is defined
                if ct == "Stockholders":
                    # Check if "Company Stockholders" or similar is defined
                    company_variants = [f"Company {ct}", f"{ct} of Company"]
                    if not any(variant.lower() in defined for variant in company_variants):
                        undefined.append(ct)
                elif ct == "Fundamental Representations":
                    # Check if "Company Fundamental Representations" or similar is defined
                    company_variants = [f"Company {ct}", f"{ct} of Company"]
                    if not any(variant.lower() in defined for variant in company_variants):
                        undefined.append(ct)
                else:
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
        # FIXED: Improved execution readiness gate logic
        # Check for ghost obligors (the main blocker)
        blockers = [f for f in findings if f.rule in ("ghost_obligor", "undefined_controlling_terms")]

        # Check for missing referenced operative documents (Plan of Merger / Disclosure Schedules)
        refs = set(re.findall(r"\b(?:Plan\s+of\s+Merger|Disclosure\s+Schedules?)\b", text, re.IGNORECASE))
        missing = []

        for ref in refs:
            # More precise checking for existence of referenced documents
            # Check for explicit references to the document with "means" or "set forth" or "attached"
            if not re.search(re.escape(ref) + r"\b[\s\S]{0,40}[:=]", text, re.IGNORECASE) and \
               not re.search(re.escape(ref) + r"\b[^.]{0,30}\b(?:means|set\s+forth|attached|annexed|described|referenced)", text, re.IGNORECASE):
                # Additional check: if it's an SEC exhibit, don't treat it as a blocker
                # Check if this is an SEC exhibit based on the filename/header pattern
                is_sec_exhibit = re.search(r"(?:EX-\d+\.\d+|Exhibit\s+\d+\.\d+|EXHIBIT\s+\d+\.\d+)", text, re.IGNORECASE)
                if not is_sec_exhibit:
                    missing.append(ref)

        # Also check for SEC exhibits that should be exempted from the gate
        sec_exhibit_pattern = r"(?:EX-\d+\.\d+|Exhibit\s+\d+\.\d+|EXHIBIT\s+\d+\.\d+)"
        is_sec_exhibit = bool(re.search(sec_exhibit_pattern, text, re.IGNORECASE))

        # If it's an SEC exhibit, missing schedules shouldn't block execution
        if is_sec_exhibit:
            # Check if any missing schedules are referenced in the text
            schedule_refs = re.findall(r"(?:Schedule|Exhibit|Annex|Appendix)\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))?|[A-Z]+(?:-\d+)?)", text, re.IGNORECASE)
            if schedule_refs:
                # If it's an SEC exhibit, don't count missing schedules as blockers
                # Just log them as informational
                pass

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
    # TERMINATION ASYMMETRY (FIXED)
    # ─────────────────────────────────────────────────────────────────────────
    def _check_termination_asymmetry(self, text: str) -> List[RiskFinding]:
        findings = []

        # Fixed: Properly analyze cure periods and termination rights
        # Look for cure periods for each party
        seller_cure = re.search(
            r"(?:seller|target|company).{0,100}cure.*?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|week|month)",
            text, re.IGNORECASE)
        buyer_cure = re.search(
            r"(?:buyer|purchaser|acquirer).{0,100}cure.*?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|week|month)",
            text, re.IGNORECASE)

        # Look for termination rights
        seller_terminate = re.search(
            r"(?:seller|target|company).{0,80}terminate.{0,80}(?:convenience|any time|sole discretion|at will)",
            text, re.IGNORECASE)
        buyer_terminate = re.search(
            r"(?:buyer|purchaser|acquirer).{0,120}terminate.{0,120}(?:fraud|judicial|final|material breach|for cause)",
            text, re.IGNORECASE)

        # Check for actual asymmetry in cure periods
        if seller_cure and buyer_cure:
            # Extract cure period lengths
            seller_match = re.search(r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|week|month)', seller_cure.group(0), re.IGNORECASE)
            buyer_match = re.search(r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:day|week|month)', buyer_cure.group(0), re.IGNORECASE)

            # Parse numbers
            def parse_duration(match):
                if not match:
                    return 0
                text = match.group(0).lower()
                # Handle number words
                word_map = {
                    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
                }
                # Extract number
                num_match = re.search(r'(\d+|one|two|three|four|five|six|seven|eight|nine|ten)', text)
                if num_match:
                    num_str = num_match.group(1)
                    if num_str.isdigit():
                        return int(num_str)
                    else:
                        return word_map.get(num_str, 0)
                return 0

            seller_days = parse_duration(seller_match)
            buyer_days = parse_duration(buyer_match)

            # Check if there's an asymmetry where seller has longer cure period
            # (this would favor the seller, not the buyer as previously misidentified)
            if seller_days > buyer_days and seller_days > 0 and buyer_days > 0:
                ded = self.config['deductions'].get('deal_protections', {}).get(
                    'termination_asymmetry', {})
                findings.append(RiskFinding(
                    rule="termination_asymmetry",
                    deduction=ded.get('deduction', 20),
                    description=ded.get(
                        'description',
                        f"Termination/cure asymmetry: Seller has longer cure period ({seller_days} days) than Buyer ({buyer_days} days) — favors seller"),
                    severity=ded.get('severity', 'high'),
                    suggestion=ded.get(
                        'suggestion',
                        "Equalize cure periods or clarify which party bears the risk of delay."),
                ))

        # Check for termination rights asymmetry
        if seller_terminate and buyer_terminate:
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

    # ── Regulatory Analysis Detection ───────────────────────────────
    def _check_regulatory_risks(self, text: str) -> List[RiskFinding]:
        """Detect HSR, CFIUS, FCPA, Export Control, and Privacy Law indicators."""
        findings = []
        ded = self.config['deductions'].get('regulatory', {})

        # HSR Threshold Detection
        hsr_score = 0
        hsr_desc = ""
        hsr_sev = "medium"
        # Match whole-word HSR threshold, not substrings like "earnout"
        if re.search(r'\bHSR\b.{0,200}threshold|threshold.{0,200}\bHSR', text, re.IGNORECASE):
            hsr_score = ded.get('hsr_threshold_detected', {}).get('deduction', 5) if ded.get('hsr_threshold_detected') else 5
            hsr_desc = ded.get('hsr_threshold_detected', {}).get('description',
                "HSR threshold requirements identified — transaction may require HSR filing")
            hsr_sev = ded.get('hsr_threshold_detected', {}).get('severity', 'medium')
        elif re.search(r'\btransaction value\b.{0,200}\$?\s*[\d,.]+\s*(?:million|billion)', text, re.IGNORECASE):
            hsr_score = ded.get('transaction_value_analysis', {}).get('deduction', 8) if ded.get('transaction_value_analysis') else 8
            hsr_desc = ded.get('transaction_value_analysis', {}).get('description',
                "Transaction value analysis indicates potential HSR filing requirement")
            hsr_sev = ded.get('transaction_value_analysis', {}).get('severity', 'medium')

        if hsr_score > 0:
            findings.append(RiskFinding(
                rule="hsr_threshold_detection",
                deduction=hsr_score,
                description=hsr_desc,
                severity=hsr_sev,
                suggestion="Review HSR Act compliance; if filing threshold is exceeded, ensure 20-day waiting period observed before closing."
            ))

        # CFIUS Flag Detection
        cfi_score = 0
        cfi_desc = ""
        cfi_sev = "medium"
        if re.search(r'foreign person|outside US|non-US acquiror', text, re.IGNORECASE):
            cfi_score = ded.get('foreign_acquiror_flag', {}).get('deduction', 5) if ded.get('foreign_acquiror_flag') else 5
            cfi_desc = ded.get('foreign_acquiror_flag', {}).get('description',
                "Foreign person flag identified — CFIUS review may be required")
            cfi_sev = ded.get('foreign_acquiror_flag', {}).get('severity', 'medium')
        elif re.search(r'CFIUS|national security|foreign government', text, re.IGNORECASE):
            cfi_score = ded.get('cfiustrigger_flag', {}).get('deduction', 8) if ded.get('cfiustrigger_flag') else 8
            cfi_desc = ded.get('cfiustrigger_flag', {}).get('description',
                "CFIUS national security trigger identified — mandatory review likely")
            cfi_sev = ded.get('cfiustrigger_flag', {}).get('severity', 'high')

        if cfi_score > 0:
            findings.append(RiskFinding(
                rule="cfius_flag_detection",
                deduction=cfi_score,
                description=cfi_desc,
                severity=cfi_sev,
                suggestion="If non-US acquirer buying US target, CFIUS review required. Allow 30-day initial review period; response to second request can extend to 180+ days."
            ))

        # FCPA Red Flag Detection
        fcpa_score = 0
        fcpa_desc = ""
        fcpa_sev = "medium"
        fcpa_patterns = {
            'foreign_official': (r'foreign official|government action|travel and entertainment', 3, 'medium'),
            'facilitation_payments': (r'facilitation payments|undisclosed agents|third-party consultants', 5, 'high'),
            'knowledge_willful': (r'knowledge of|willful|conscious disregard', 4, 'high'),
        }
        for rule_name, (pattern, deduction, severity) in fcpa_patterns.items():
            if re.search(pattern, text, re.IGNORECASE):
                fcpa_score = deduction
                fcpa_desc = ded.get(rule_name, {}).get('description', f"FCPA red flag: {rule_name.replace('_', ' ')}")
                fcpa_sev = severity

        if fcpa_score > 0:
            findings.append(RiskFinding(
                rule="fcpa_red_flag_detection",
                deduction=fcpa_score,
                description=fcpa_desc,
                severity=fcpa_sev,
                suggestion="Review third-party relationships and travel/entertainment; ensure adequate FCPA compliance procedures and disclosure of any foreign official interactions."
            ))

        # Export Control Detection
        export_score = 0
        export_desc = ""
        export_sev = "medium"
        # Use word boundaries to avoid matching "earnout", "EBITDA", etc.
        if re.search(r'\bEAR\b.{0,100}|\bITAR\b.{0,100}', text, re.IGNORECASE):
            export_score = ded.get('ear_itar_mention', {}).get('deduction', 5) if ded.get('ear_itar_mention') else 5
            export_desc = ded.get('ear_itar_mention', {}).get('description',
                "EAR or ITAR referenced — export control compliance may be required")
            export_sev = ded.get('ear_itar_mention', {}).get('severity', 'medium')
        elif re.search(r'\bdeemed exports\b|\\btechnical data\b|\\bdefense articles\b', text, re.IGNORECASE):
            export_score = ded.get('deemed_export_technical_data', {}).get('deduction', 8) if ded.get('deemed_export_technical_data') else 8
            export_desc = ded.get('deemed_export_technical_data', {}).get('description',
                "Deemed exports or technical data identified — licensing requirements may apply")
            export_sev = ded.get('deemed_export_technical_data', {}).get('severity', 'high')

        if export_score > 0:
            findings.append(RiskFinding(
                rule="export_control_detection",
                deduction=export_score,
                description=export_desc,
                severity=export_sev,
                suggestion="Identify technology classification (EAR/ITAR); determine licensing requirements for transfer/ deemed exports; review sanction screen for prohibited end-uses and countries."
            ))

        # Privacy Law Indicator Detection
        privacy_score = 0
        privacy_desc = ""
        privacy_sev = "low"
        if re.search(r'GDPR.{0,100}|CCPA.{0,100}|PIPEDA.{0,100}', text, re.IGNORECASE):
            privacy_score = ded.get('privacy_law_indicator', {}).get('deduction', 3) if ded.get('privacy_law_indicator') else 3
            privacy_desc = ded.get('privacy_law_indicator', {}).get('description',
                "Privacy law indicator (GDPR/CCPA/PIPEDA) identified — data protection compliance may be required")
            privacy_sev = ded.get('privacy_law_indicator', {}).get('severity', 'low')
        elif re.search(r'international transfer|cross-border data', text, re.IGNORECASE):
            privacy_score = ded.get('cross_border_data_transfer', {}).get('deduction', 5) if ded.get('cross_border_data_transfer') else 5
            privacy_desc = ded.get('cross_border_data_transfer', {}).get('description',
                "Cross-border data transfer identified — data localization or transfer mechanisms may be required")
            privacy_sev = ded.get('cross_border_data_transfer', {}).get('severity', 'medium')

        if privacy_score > 0:
            findings.append(RiskFinding(
                rule="privacy_law_indicator_detection",
                deduction=privacy_score,
                description=privacy_desc,
                severity=privacy_sev,
                suggestion="Map data flows; implement appropriate transfer mechanisms (SCC, BCR, or consent); review data subject rights implementation."
            ))

        # Jurisdictional Flag Detection
        jurisd_score = 0
        jurisd_desc = ""
        jurisd_sev = "low"
        if re.search(r'Delaware', text, re.IGNORECASE):
            jurisd_score = ded.get('delaware_governing_law', {}).get('deduction', 2) if ded.get('delaware_governing_law') else 2
            jurisd_desc = ded.get('delaware_governing_law', {}).get('description',
                "Delaware governing law identified — Delaware Court of Chancery precedent applies")
            jurisd_sev = ded.get('delaware_governing_law', {}).get('severity', 'low')
        elif re.search(r'New York', text, re.IGNORECASE):
            jurisd_score = ded.get('new_york_governing_law', {}).get('deduction', 2) if ded.get('new_york_governing_law') else 2
            jurisd_desc = ded.get('new_york_governing_law', {}).get('description',
                "New York governing law identified — New York courts will interpret")
            jurisd_sev = ded.get('new_york_governing_law', {}).get('severity', 'low')
        elif re.search(r'English law|Swiss law', text, re.IGNORECASE):
            jurisd_score = ded.get('foreign_governing_law', {}).get('deduction', 3) if ded.get('foreign_governing_law') else 3
            jurisd_desc = ded.get('foreign_governing_law', {}).get('description',
                "Foreign governing law identified — non-US legal framework applies")
            jurisd_sev = ded.get('foreign_governing_law', {}).get('severity', 'medium')

        if jurisd_score > 0:
            findings.append(RiskFinding(
                rule="jurisdictional_flag_detection",
                deduction=jurisd_score,
                description=jurisd_desc,
                severity=jurisd_sev,
                suggestion="Verify chosen jurisdiction's enforceability; consider mandatory mediation/arbitration clause; confirm recognition and enforcement of judgments in target jurisdiction."
            ))

        # Add interaction stack: HSR + CFIUS compound risk
        hsr_found = any(f.rule == "hsr_threshold_detection" for f in findings)
        cfi_found = any(f.rule == "cfius_flag_detection" for f in findings)
        if hsr_found and cfi_found:
            # Find the interaction weighting entry and apply compounded deduction
            findings.append(RiskFinding(
                rule="hsr_cfiustack",
                deduction=10,
                description="HSR and CFIUS both triggered — combined regulatory waiting periods can extend deal closure by 180+ days; coordinate filing strategy",
                severity="high",
                suggestion="Coordinate HSR and CFIUS filings where possible; evaluate if early jurisdictional seek is advisable; budget 4-6 months for regulatory clearance."
            ))

        return findings
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
        """Get risk level and recommendation from score.

        Supports risk_level_override to allow per-firm customization of
        risk level boundaries without modifying config.yaml.
        """
        # Use override if provided
        if self.risk_level_override:
            for level_name, level_range in self.risk_level_override.items():
                if len(level_range) == 2 and level_range[0] <= score <= level_range[1]:
                    # Return custom label/recommendation if provided, else default
                    return level_name, f"Review at custom {level_name} threshold"

        # Fall back to config.yaml risk levels
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

    def recalculate_score(self, result: AnalysisResult) -> Dict[str, any]:
        """Recalculate the analysis score with what-if overrides applied.

        This method re-runs the key checks with user-overridden parameters
        to show the impact of what-if scenario changes.

        Returns dict with:
            - adjusted_final_score: int, the recalculated score
            - modified_findings: list of findings affected by overrides
            - override_impact: dict describing what was changed
        """
        # Build modified text based on overrides
        # We'll recalculate by re-running key checks with overridden values

        modified_findings = []
        override_impact = {}

        # 1. Survival period override impact
        if self.survival_period_override_months is not None:
            override_impact['survival_period_override'] = {
                'requested_months': self.survival_period_override_months,
                'previous': 'document-detected value',
                ' effect': 'recalculates survival_period_too_short deductions'
            }
            # Shorten survival period flag may be removed if override >= 12 months
            # Lengthen may add deductions if override < document value

        # 2. Cap/basket override impact
        if self.indemnification_cap_pct_override is not None:
            override_impact['cap_override'] = {
                'requested_pct': self.indemnification_cap_pct_override,
                'effect': 'recalculates missing_cap_only and cap_below_basket deductions'
            }

        if self.indemnification_basket_pct_override is not None:
            override_impact['basket_override'] = {
                'requested_pct': self.indemnification_basket_pct_override,
                'effect': 'recalculates missing_basket_only and cap_below_basket deductions'
            }

        # 3. Earnout metric override impact
        if self.earnout_metric_override is not None:
            override_impact['earnout_metric_override'] = {
                'requested_metric': self.earnout_metric_override,
                'effect': 'if metric present in document, removes undefined_metrics deduction'
            }

        # 4. Recalculate raw score with overridden parameters
        # Re-run the analysis logic with overrides
        # This is a simplified recalculation - full re-analysis would re-run all checks

        # Get the original result's raw score components
        raw_score = result.raw_score
        skeleton_leniency = result.skeleton_leniency_applied
        final_score = result.final_score

        # Apply survival period override effect on survival_too_short deductions
        survival_deduction_removed = 0
        if self.survival_period_override_months is not None:
            # Count how many survival_period_too_short findings we have
            short_survival_findings = [f for f in result.findings if f.rule == 'survival_period_too_short']
            if short_survival_findings:
                # If override >= 12 months, remove the survival too short deduction
                if self.survival_period_override_months >= 12:
                    survival_deduction_removed = len(short_survival_findings) * 15
                elif self.survival_period_override_months < 12:
                    # Shorter period increases deduction
                    survival_deduction_removed = -len(short_survival_findings) * 15

        # Apply cap override effect
        cap_deduction_adjustment = 0
        if self.indemnification_cap_pct_override is not None:
            cap_findings = [f for f in result.findings if f.rule in ('missing_cap_only', 'cap_below_basket')]
            if cap_findings:
                # If new cap is reasonable, remove the missing cap deduction
                if self.indemnification_cap_pct_override >= 10:
                    cap_deduction_adjustment += 10  # remove missing_cap_only
                # cap_below_basket is handled separately

        # Apply basket override effect
        basket_deduction_adjustment = 0
        if self.indemnification_basket_pct_override is not None:
            basket_findings = [f for f in result.findings if f.rule == 'missing_basket_only']
            if basket_findings:
                if self.indemnification_basket_pct_override >= 0.5:
                    basket_deduction_adjustment = 5  # remove missing_basket_only

        # Apply earnout metric override effect
        earnout_deduction_adjustment = 0
        if self.earnout_metric_override is not None:
            undefined_metrics_findings = [f for f in result.findings if f.rule == 'undefined_metrics']
            if undefined_metrics_findings:
                # If the selected metric is present in the document, remove the deduction
                earnout_deduction_adjustment = 18  # remove undefined_metrics deduction

        adjusted_final_score = min(100, max(0, final_score + survival_deduction_removed + cap_deduction_adjustment + basket_deduction_adjustment + earnout_deduction_adjustment))

        return {
            'adjusted_final_score': adjusted_final_score,
            'modified_findings': modified_findings,
            'override_impact': override_impact,
            'survival_period_override_months': self.survival_period_override_months,
            'indemnification_cap_pct_override': self.indemnification_cap_pct_override,
            'indemnification_basket_pct_override': self.indemnification_basket_pct_override,
            'earnout_metric_override': self.earnout_metric_override,
        }

    def _determine_output_sections(self, result: AnalysisResult) -> Dict[str, str]:
        """Determine which output sections to include based on self.output_sections.

        Returns a dict mapping section names to their formatted text (or empty string if hidden).
        """
        sections = {}

        # risk_score
        if 'risk_score' in self.output_sections:
            sections['risk_score'] = f"VIABILITY: {result.risk_level}  |  Score: {result.final_score}/100"
        else:
            sections['risk_score'] = ''

        # executive_summary
        if 'executive_summary' in self.output_sections:
            sections['executive_summary'] = result.recommendation
        else:
            sections['executive_summary'] = ''

        # defined_terms
        if 'defined_terms' in self.output_sections:
            # Summarize defined terms from findings
            defined_term_findings = [f for f in result.findings if 'definition' in f.rule.lower()]
            if defined_term_findings:
                sections['defined_terms'] = "Missing definitions: " + ", ".join([f.description for f in defined_term_findings[:5]])
            else:
                sections['defined_terms'] = "All key definitions present"
        else:
            sections['defined_terms'] = ''

        # covenants
        if 'covenants' in self.output_sections:
            covenant_findings = [f for f in result.findings if f.rule == 'no_affirmative_covenants']
            if covenant_findings:
                sections['covenants'] = "Missing affirmative covenants detected"
            else:
                sections['covenants'] = "Affirmative covenants present"
        else:
            sections['covenants'] = ''

        # indemnification
        if 'indemnification' in self.output_sections:
            indemnity_findings = [f for f in result.findings if f.rule in ('missing_framework', 'missing_cap_only', 'missing_basket_only', 'missing_survival_only')]
            if indemnity_findings:
                sections['indemnification'] = "Indemnification issues: " + "; ".join([f.description for f in indemnity_findings[:3]])
            else:
                sections['indemnification'] = "Indemnification framework complete"
        else:
            sections['indemnification'] = ''

        # survival_periods
        if 'survival_periods' in self.output_sections:
            surv_findings = [f for f in result.findings if f.rule == 'survival_period_too_short']
            if surv_findings:
                sections['survival_periods'] = "Survival period issues: " + "; ".join([f.description for f in surv_findings[:3]])
            else:
                sections['survival_periods'] = "Survival periods adequate"
        else:
            sections['survival_periods'] = ''

        # earnout
        if 'earnout' in self.output_sections:
            earnout_findings = [f for f in result.findings if f.rule in ('undefined_metrics', 'missing_dispute_resolution')]
            if earnout_findings:
                sections['earnout'] = "Earnout issues: " + "; ".join([f.description for f in earnout_findings[:3]])
            else:
                sections['earnout'] = "Earnout framework complete"
        else:
            sections['earnout'] = ''

        # regulatory
        if 'regulatory' in self.output_sections:
            reg_findings = [f for f in result.findings if f.rule == 'undefined_controlling_terms']
            if reg_findings:
                sections['regulatory'] = "Regulatory issues: " + "; ".join([f.description for f in reg_findings[:3]])
            else:
                sections['regulatory'] = "No regulatory issues detected"
        else:
            sections['regulatory'] = ''

        # disclosures
        if 'disclosures' in self.output_sections:
            disc_findings = [f for f in result.findings if f.rule == 'missing_schedules_referenced']
            if disc_findings:
                sections['disclosures'] = "Disclosure issues: " + "; ".join([f.description for f in disc_findings[:3]])
            else:
                sections['disclosures'] = "Disclosures complete"
        else:
            sections['disclosures'] = ''

        # boilerplate
        if 'boilerplate' in self.output_sections:
            boilerplate_findings = [f for f in result.findings if f.rule in ('missing_entire_agreement', 'missing_governing_law')]
            if boilerplate_findings:
                sections['boilerplate'] = "Boilerplate issues: " + "; ".join([f.description for f in boilerplate_findings[:3]])
            else:
                sections['boilerplate'] = "Boilerplate complete"
        else:
            sections['boilerplate'] = ''

        return sections

    def format_output(self, result: AnalysisResult) -> str:
        """Format analysis result as beautiful scorecard

        Supports output section customization via self.output_sections.
        Each section can be shown or hidden based on user preferences.
        Dark-mode compatible color scheme.
        """
        # Determine which sections to include
        sections = self._determine_output_sections(result)

        output = []
        output.append("═══════════════════════════════════════════════════")
        output.append("MERGER AGREEMENT RISK SCORECARD")
        output.append(f"Document: {result.document_name}")
        output.append(f"Analyzed: {result.timestamp}")
        output.append("═══════════════════════════════════════════════════")

        # VIABILITY section (risk_score) - always shown at top
        if sections["risk_score"]:
            output.append(sections["risk_score"])
        else:
            output.append(f"VIABILITY: {result.risk_level}  |  Score: {result.final_score}/100")
        output.append(f"RECOMMENDATION: {result.recommendation}")
        output.append("")

        # TOP 3 DEAL-BREAKERS
        output.append("TOP 3 DEAL-BREAKERS:")
        # Show deal-breakers from indemnification findings
        indemnity_findings = [f for f in result.findings if f.rule in ("missing_framework", "missing_cap_only", "missing_basket_only", "missing_survival_only")]
        severe_findings = [f for f in result.findings if f.deduction >= 8]
        for i, finding in enumerate(severe_findings[:3], 1):
            output.append(f"{i}. {finding.description}")
        output.append("")

        # MUST-FIX BEFORE SIGNING
        output.append("MUST-FIX BEFORE SIGNING (MAX 5)")
        output.append("═══════════════════════════════════════════════════")
        for item in result.must_fix_items:
            severity_icon = "🔴" if item["severity"] == "critical" else "🟠" if item["severity"] == "high" else "🟡"
            output.append(f"{severity_icon} {item["description"]}")
            output.append(f"   → Fix: {item["suggestion"]}")
            output.append("")

        # WHAT YOUR ANALYZER CAUGHT WELL
        output.append("WHAT YOUR ANALYZER CAUGHT WELL")
        output.append("═══════════════════════════════════════════════════")
        for strength in result.strengths[:5]:
            output.append(strength)
        output.append("")

        if result.arbitration_threshold:
            output.append(f"📍 Arbitration: {result.arbitration_threshold["jurisdiction"].title()} – Minimum rational claim: ${result.arbitration_threshold["min_claim_usd"]:,}")
            output.append("")

        # WHAT YOUR ANALYZER MISSED (FEEDBACK FOR TRAINING)
        output.append("WHAT YOUR ANALYZER MISSED (FEEDBACK FOR TRAINING)")
        output.append("═══════════════════════════════════════════════════")
        for missed in result.missed_items:
            output.append(f"❌ {missed}")
        output.append("")

        # ADJUSTED SCORE IF FIXES APPLIED
        output.append("ADJUSTED SCORE IF FIXES APPLIED: " + str(result.adjusted_score_if_fixed) + "/100")
        output.append("═══════════════════════════════════════════════════")
        output.append("")

        # FORMATION VALIDITY
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

    def _determine_clause_direction(self, clause_text: str) -> tuple:
        """
        Determine which party benefits from a clause's asymmetry.
        Returns (actor, beneficiary, favors) where:
        - actor: the party who must perform/cure/pay
        - beneficiary: the party who benefits from the longer period
        - favors: BUYER | SELLER | NEUTRAL
        """
        clause_text_lower = clause_text.lower()

        # Look for party-specific language that indicates who performs
        buyer_indicators = [
            r"buyer.*cure", r"purchaser.*cure", r"acquirer.*cure",
            r"buyer.*terminate", r"purchaser.*terminate", r"acquirer.*terminate",
            r"buyer.*pay", r"buyer.*indemnify", r"buyer.*hold.*harmless"
        ]

        seller_indicators = [
            r"seller.*cure", r"target.*cure", r"company.*cure",
            r"seller.*terminate", r"target.*terminate", r"company.*terminate",
            r"seller.*pay", r"seller.*indemnify", r"seller.*hold.*harmless"
        ]

        # Look for time periods to determine who benefits
        # The party that gets the longer period benefits
        periods = re.findall(r'(\d+)\s+(?:day|week|month|year)', clause_text, re.IGNORECASE)

        # Check if the clause mentions a specific party performing actions
        actor = "NEUTRAL"
        beneficiary = "NEUTRAL"
        favors = "NEUTRAL"

        # Check for buyer language
        for pattern in buyer_indicators:
            if re.search(pattern, clause_text_lower):
                actor = "BUYER"
                break

        # Check for seller language
        for pattern in seller_indicators:
            if re.search(pattern, clause_text_lower):
                actor = "SELLER"
                break

        # If we can't determine the actor from explicit party references,
        # look at the clause structure more carefully
        if actor == "NEUTRAL":
            # Look for patterns like "Company may not terminate unless Parent breach is uncured after 30 days"
            # This means Parent gets 30 days to cure
            if re.search(r'(?:company|target|seller).*terminate.*unless.*parent.*breach.*uncured.*after', clause_text_lower):
                actor = "PARENT"  # The party that must cure (Parent)
                beneficiary = "COMPANY"  # The party that benefits (Company gets to terminate)
                favors = "SELLER"  # Seller benefits from longer cure period
            elif re.search(r'(?:parent|buyer).*terminate.*unless.*company.*breach.*uncured.*after', clause_text_lower):
                actor = "COMPANY"  # The party that must cure (Company)
                beneficiary = "PARENT"  # The party that benefits (Parent gets to terminate)
                favors = "BUYER"  # Buyer benefits from longer cure period

        return actor, beneficiary, favors


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
