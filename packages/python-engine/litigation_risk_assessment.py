# litigation_risk_assessment.py
"""
Litigation Risk Assessment Module

Assesses litigation risk across 12 areas per the spec.
Provides Evidence, Risk drivers, Mitigating factors, Confidence, Information gaps for each.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple
import re


class LitigationArea(Enum):
    SHAREHOLDER_CLAIMS = "shareholder_claims"
    APPRAISAL_ACTIONS = "appraisal_actions"
    FIDUCIARY_DUTY_CLAIMS = "fiduciary_duty_claims"
    DISCLOSURE_LITIGATION = "disclosure_litigation"
    ANTITRUST_CHALLENGES = "antitrust_challenges"
    REGULATORY_INVESTIGATIONS = "regulatory_investigations"
    EARNOUT_DISPUTES = "earnout_disputes"
    PURCHASE_PRICE_ADJUSTMENT_DISPUTES = "purchase_price_adjustment_disputes"
    FRAUD_ALLEGATIONS = "fraud_allegations"
    TAX_DISPUTES = "tax_disputes"
    EMPLOYMENT_CLAIMS = "employment_claims"
    IP_DISPUTES = "ip_disputes"
    ENVIRONMENTAL_CLAIMS = "environmental_claims"


class ConfidenceLevel(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskLevel(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"


@dataclass
class LitigationRiskFinding:
    """Single litigation risk finding with full analysis"""
    area: LitigationArea
    risk_level: RiskLevel
    evidence: str
    risk_drivers: List[str]
    mitigating_factors: List[str]
    confidence: ConfidenceLevel
    information_gaps: List[str]
    suggested_action: str = ""

    def to_dict(self) -> Dict:
        return {
            "area": self.area.value,
            "risk_level": self.risk_level.value,
            "evidence": self.evidence,
            "risk_drivers": self.risk_drivers,
            "mitigating_factors": self.mitigating_factors,
            "confidence": self.confidence.value,
            "information_gaps": self.information_gaps,
            "suggested_action": self.suggested_action
        }


class LitigationRiskAssessor:
    """Assesses litigation risk across all 12 categories"""

    def __init__(self):
        self.patterns = self._build_litigation_patterns()

    def _build_litigation_patterns(self) -> Dict[str, List[str]]:
        """Build regex patterns for each litigation area"""
        return {
            "shareholder_claims": [
                r'\bshareholder\s+(?:class\s+action|derivative\s+suit|oppression)\b',
                r'\bappraisal\s+rights?\b',
                r'\bcontrolling\s+shareholder\s+conflict\b',
                r'\bminority\s+shareholder\s+protection\b',
            ],
            "appraisal_actions": [
                r'\bappraisal\s+(?:rights?|proceeding|demand|action)\b',
                r'\bdissenting\s+shareholder\b',
                r'\bfair\s+value\s+determination\b',
            ],
            "fiduciary_duty_claims": [
                r'\bfiduciary\s+duty\b',
                r'\bduty\s+of\s+(?:care|loyalty|good\s+faith)\b',
                r'\bconflict\s+of\s+interest\s+(?:disclosure|waiver)\b',
                r'\binterested\s+transaction\b',
                r'\bentire\s+fairness\s+standard\b',
            ],
            "disclosure_litigation": [
                r'\bdisclosure\s+(?:failure|omission|misrepresentation)\b',
                r'\bmaterial\s+(?:misstatement|omission)\b',
                r'\bproxy\s+statement\s+(?:deficiency|inaccuracy)\b',
                r'\bsec\s+rule\s+10b-5\b',
                r'\b14a-9\b',
            ],
            "antitrust_challenges": [
                r'\bhart-scott-rodino\b|\bhsr\b',
                r'\bclayton\s+act\s+section\s+7\b',
                r'\bsherman\s+act\s+section\s+1\b',
                r'\bmarket\s+concentration\b',
                r'\bhorizontal\s+merger\b',
                r'\bvertical\s+merger\b',
            ],
            "regulatory_investigations": [
                r'\bsec\s+(?:investigation|inquiry|enforcement)\b',
                r'\bdoj\s+(?:investigation|inquiry)\b',
                r'\bftc\s+(?:investigation|inquiry)\b',
                r'\bcfius\s+(?:review|investigation)\b',
                r'\bconsent\s+decree\b',
                r'\bcease\s+and\s+desist\b',
            ],
            "earnout_disputes": [
                r'\bearnout\s+(?:dispute|litigation|calculation|disagreement)\b',
                r'\badjusted\s+ebitda\s+(?:dispute|calculation)\b',
                r'\bpost-closing\s+integration\s+(?:interference|restriction)\b',
                r'\binsurance\s+accounting\s+dispute\b',
            ],
            "purchase_price_adjustment_disputes": [
                r'\bworking\s+capital\s+(?:adjustment|dispute|true-up)\b',
                r'\bclosing\s+balance\s+sheet\s+(?:dispute|objection)\b',
                r'\bpost-closing\s+adjustment\s+(?:mechanism|dispute)\b',
            ],
            "fraud_allegations": [
                r'\bfraud\s+(?:allegation|claim|action)\b',
                r'\bintentional\s+misrepresentation\b',
                r'\bscheme\s+to\s+defraud\b',
                r'\bfraudulent\s+inducement\b',
            ],
            "tax_disputes": [
                r'\btax\s+(?:audit|controversy|dispute|litigation)\b',
                r'\bir\b\s+(?:audit|examination)\b',
                r'\bsection\s+382\b',
                r'\btransfer\s+pricing\b',
            ],
            "employment_claims": [
                r'\bemployment\s+(?:discrimination|harassment|wrongful\s+termination)\b',
                r'\bwage\s+and\s+hour\s+(?:violation|claim)\b',
                r'\bwarn\s+act\b',
                r'\berisa\s+(?:violation|claim)\b',
                r'\bnon-compete\s+enforcement\b',
            ],
            "ip_disputes": [
                r'\bpatent\s+(?:infringement|validity|enforcement)\b',
                r'\btrademark\s+(?:infringement|dilution)\b',
                r'\btrade\s+secret\s+misappropriation\b',
                r'\bcopyright\s+infringement\b',
                r'\bopen\s+source\s+license\s+(?:violation|compliance)\b',
            ],
            "environmental_claims": [
                r'\bcercla\b|\bsuperfund\b',
                r'\brcra\b',
                r'\bclean\s+water\s+act\b',
                r'\bclean\s+air\s+act\b',
                r'\bphase\s+i\s+environmental\b',
                r'\bphase\s+ii\s+environmental\b',
                r'\benvironmental\s+(?:liability|cleanup|remediation)\b',
            ],
        }

    def assess(self, text: str, context: Optional[Dict] = None) -> List[LitigationRiskFinding]:
        """Run full litigation risk assessment"""
        findings = []

        for area_name, patterns in self.patterns.items():
            area = LitigationArea(area_name)
            finding = self._assess_area(area, patterns, text, context or {})
            findings.append(finding)

        return findings

    def _assess_area(self,
                     area: LitigationArea,
                     patterns: List[str],
                     text: str,
                     context: Dict) -> LitigationRiskFinding:
        """Assess a single litigation area"""
        evidence_parts = []
        risk_drivers = []
        mitigating_factors = []

        # Check for pattern matches
        for pattern in patterns:
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            if matches:
                for match in matches[:3]:  # Limit to first 3 matches
                    context_span = text[max(0, match.start() - 100):match.end() + 100]
                    evidence_parts.append(f"Pattern '{pattern}' found: {context_span.strip()}")
                risk_drivers.append(f"Contract language triggers {len(matches)} potential {area.value} indicators")

        # Determine risk level based on findings
        if len(evidence_parts) >= 3:
            risk_level = RiskLevel.CRITICAL
            confidence = ConfidenceLevel.HIGH
        elif len(evidence_parts) >= 1:
            risk_level = RiskLevel.HIGH
            confidence = ConfidenceLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW
            confidence = ConfidenceLevel.LOW

        # Add context-specific mitigating factors
        if context.get("has_indemnification_cap"):
            mitigating_factors.append("Indemnification cap limits exposure")
        if context.get("has_escrow"):
            mitigating_factors.append("Escrow provides recovery mechanism")
        if context.get("has_rwi"):
            mitigating_factors.append("RWI policy provides additional coverage")

        # Add standard mitigating factors for each area
        area_mitigators = {
            LitigationArea.SHAREHOLDER_CLAIMS: ["Exculpation charter provisions", "Business judgment rule protection"],
            LitigationArea.FIDUCIARY_DUTY_CLAIMS: ["Independent committee approval", "Majority-of-minority vote"],
            LitigationArea.DISCLOSURE_LITIGATION: ["Customary disclosure schedules", "Materiality qualifiers"],
            LitigationArea.ANTITRUST_CHALLENGES: ["HSR filing completed", "No competitive overlap"],
            LitigationArea.EARNOUT_DISPUTES: ["Independent accountant mechanism", "GAAP-based definitions"],
            LitigationArea.PURCHASE_PRICE_ADJUSTMENT_DISPUTES: ["Independent auditor mechanism", "Collar provisions"],
        }

        if area in area_mitigators:
            mitigating_factors.extend(area_mitigators[area])

        # Information gaps
        information_gaps = []
        if not context.get("has_disclosure_schedules"):
            information_gaps.append("Disclosure schedules not reviewed")
        if not context.get("has_financial_statements"):
            information_gaps.append("Audited financial statements not available")
        if not context.get("has_regulatory_filings"):
            information_gaps.append("Regulatory filings (HSR, CFIUS) status unknown")

        # Suggested action
        suggested_actions = {
            LitigationArea.SHAREHOLDER_CLAIMS: "Engage litigation counsel early; review appraisal rights procedures",
            LitigationArea.FIDUCIARY_DUTY_CLAIMS: "Form independent committee; obtain fairness opinion",
            LitigationArea.DISCLOSURE_LITIGATION: "Conduct comprehensive disclosure review; update proxy materials",
            LitigationArea.ANTITRUST_CHALLENGES: "Prepare HSR filing; consider divestiture options",
            LitigationArea.REGULATORY_INVESTIGATIONS: "Conduct internal investigation; prepare regulatory response team",
            LitigationArea.EARNOUT_DISPUTES: "Define earnout metrics precisely; appoint independent accountant",
            LitigationArea.PURCHASE_PRICE_ADJUSTMENT_DISPUTES: "Finalize working capital methodology; set collar",
            LitigationArea.FRAUD_ALLEGATIONS: "Conduct forensic review; preserve privilege",
            LitigationArea.TAX_DISPUTES: "Obtain tax insurance; review Section 382 limitations",
            LitigationArea.EMPLOYMENT_CLAIMS: "Review employment practices; update handbooks",
            LitigationArea.IP_DISPUTES: "Conduct IP audit; verify ownership chains",
            LitigationArea.ENVIRONMENTAL_CLAIMS: "Complete Phase I/II environmental assessments",
        }

        return LitigationRiskFinding(
            area=area,
            risk_level=risk_level,
            evidence="; ".join(evidence_parts) if evidence_parts else "No direct indicators found in contract text",
            risk_drivers=risk_drivers,
            mitigating_factors=mitigating_factors,
            confidence=confidence,
            information_gaps=information_gaps,
            suggested_action=suggested_actions.get(area, "Review with legal counsel")
        )


def assess_litigation_risk(text: str, context: Optional[Dict] = None) -> List[LitigationRiskFinding]:
    """Main entry point for litigation risk assessment"""
    assessor = LitigationRiskAssessor()
    return assessor.assess(text, context)


def get_litigation_summary(findings: List[LitigationRiskFinding]) -> Dict:
    """Generate summary statistics from findings"""
    critical = [f for f in findings if f.risk_level == RiskLevel.CRITICAL]
    high = [f for f in findings if f.risk_level == RiskLevel.HIGH]
    moderate = [f for f in findings if f.risk_level == RiskLevel.MODERATE]
    low = [f for f in findings if f.risk_level == RiskLevel.LOW]

    high_confidence = [f for f in findings if f.confidence == ConfidenceLevel.HIGH]
    medium_confidence = [f for f in findings if f.confidence == ConfidenceLevel.MEDIUM]

    return {
        "total_areas_assessed": len(findings),
        "by_risk_level": {
            "critical": len(critical),
            "high": len(high),
            "moderate": len(moderate),
            "low": len(low)
        },
        "by_confidence": {
            "high": len(high_confidence),
            "medium": len(medium_confidence),
            "low": len(findings) - len(high_confidence) - len(medium_confidence)
        },
        "top_risks": [
            {"area": f.area.value, "level": f.risk_level.value, "action": f.suggested_action}
            for f in sorted(findings, key=lambda x: (x.risk_level == RiskLevel.CRITICAL, x.risk_level == RiskLevel.HIGH), reverse=True)[:5]
        ],
        "total_information_gaps": sum(len(f.information_gaps) for f in findings)
    }