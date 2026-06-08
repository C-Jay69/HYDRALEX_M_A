# merger_risk_analyzer.py
# M&A Merger Agreement Risk Scoring Engine v2.0

import re
import yaml
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

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

_DEFAULT_CONFIG = str(Path(__file__).parent / "merger_scoring_config.yaml")

class MergerRiskAnalyzer:
    """M&A Merger Agreement Risk Scoring Engine"""

    def __init__(self, config_path: str = _DEFAULT_CONFIG):
        """Initialize analyzer with YAML configuration"""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.base_score = self.config['config']['base_score']
        self.skeleton_leniency = self.config['config']['skeleton_draft_leniency']
        
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
        
        # Run all detection checks
        findings.extend(self._check_indemnification(document_text))
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
        
        # Calculate raw score
        total_deductions = sum(f.deduction for f in findings)
        raw_score = max(0, self.base_score - total_deductions)
        
        # Apply skeleton leniency (Tier 1 draft adjustment)
        is_skeleton = self._detect_skeleton_draft(document_text)
        skeleton_leniency = self.skeleton_leniency if is_skeleton else 0
        final_score = min(100, raw_score + skeleton_leniency)
        
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
            adjusted_score_if_fixed=adjusted_score
        )
    
    # ============================================================
    # DETECTION METHODS
    # ============================================================
    
    def _check_indemnification(self, text: str) -> List[RiskFinding]:
        findings = []
        deductions = self.config['deductions']['indemnification']
        
        # Check if indemnification clause exists
        has_indemnification = False
        patterns = self.patterns.get('indemnification', {}).get('present_patterns', [])
        for pattern in patterns:
            if pattern.search(text):
                has_indemnification = True
                break
        
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
        has_indemnity = re.search(r"indemnif|hold harmless", text, re.IGNORECASE)
        
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
        
        # Check for missing schedules
        schedule_refs = re.findall(r"Schedule\s+\d+[a-z]?[.)]?", text, re.IGNORECASE)
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
