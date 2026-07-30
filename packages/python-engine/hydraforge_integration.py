# hydraforge_integration.py
"""
Hydraforge M&A Analysis Platform - Integration Module

Integrates all analysis components into a unified pipeline:
- Knowledge Graph for entity relationship tracking
- Cross-Document Consistency for multi-document analysis
- Red Flag Engine for risk detection
- Regulatory Analysis for compliance requirements
- Litigation Risk Assessment for legal exposure
"""

from __future__ import annotations

from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from knowledge_graph import KnowledgeGraph, KGNode, EntityType, RelationshipType, build_knowledge_graph_from_text
from cross_document_consistency import analyze_document_consistency, ConsistencyFinding
from red_flag_engine import RedFlagEngine, build_red_flag_engine, RiskFinding
from regulatory_analysis import RegulatoryAnalysisModule, RegulatoryFinding
from litigation_risk_assessment import LitigationRiskAssessor, LitigationRiskFinding, assess_litigation_risk, get_litigation_summary


@dataclass
class AnalysisResult:
    """Complete analysis result from all modules"""
    knowledge_graph: Dict[str, Any]
    cross_document_findings: List[Dict]
    red_flags: List[Dict]
    regulatory_findings: List[Dict]
    litigation_risks: List[Dict]
    litigation_summary: Dict
    overall_risk_score: float  # 0-100


class HydraforgeAnalysisPipeline:
    """
    Main pipeline orchestrating all analysis modules.
    Called by the Adjudicator layer for final synthesis.
    """

    def __init__(self):
        self.kg = KnowledgeGraph()
        self.cross_doc_engine = None
        self.red_flag_engine = None
        self.regulatory_module = RegulatoryAnalysisModule()
        self.litigation_assessor = None

    def analyze_single_document(self, text: str, doc_name: str = "document") -> AnalysisResult:
        """Analyze a single document through all modules"""
        # Build knowledge graph
        self.kg = build_knowledge_graph_from_text(text, doc_name)

        # Initialize engines with document context
        self.red_flag_engine = RedFlagEngine(context_snippet=text[:5000])
        self.litigation_assessor = LitigationRiskAssessor()

        # Run all analyses
        cross_doc_result = analyze_document_consistency({doc_name: text})
        red_flags = self.red_flag_engine.run_full_analysis(text)
        regulatory_findings = self._run_regulatory_analysis(text)
        litigation_risks = self.litigation_assessor.assess(text, self._extract_context(text))
        litigation_summary = get_litigation_summary(litigation_risks)

        # Calculate overall risk score
        overall_score = self._calculate_overall_risk_score(red_flags, litigation_risks)

        return AnalysisResult(
            knowledge_graph=self.kg.to_dict(),
            cross_document_findings=[f.to_dict() for f in cross_doc_result.get("findings", [])],
            red_flags=[f.__dict__ for f in red_flags],
            regulatory_findings=[f.__dict__ for f in regulatory_findings],
            litigation_risks=[f.to_dict() for f in litigation_risks],
            litigation_summary=litigation_summary,
            overall_risk_score=overall_score
        )

    def analyze_multiple_documents(self, documents: Dict[str, str]) -> AnalysisResult:
        """Analyze multiple documents with cross-document consistency checks"""
        primary_doc = list(documents.keys())[0]
        primary_text = documents[primary_doc]

        # Build unified knowledge graph
        for doc_name, text in documents.items():
            doc_kg = build_knowledge_graph_from_text(text, doc_name)
            # Merge into main KG
            for node_id, node in doc_kg.nodes.items():
                if node_id not in self.kg.nodes:
                    self.kg.add_node(node)

        # Run cross-document consistency
        cross_doc_result = analyze_document_consistency(documents)

        # Analyze primary document with full pipeline
        result = self.analyze_single_document(primary_text, primary_doc)
        result.cross_document_findings = [f.to_dict() for f in cross_doc_result.get("findings", [])]

        return result

    def _run_regulatory_analysis(self, text: str) -> List[RegulatoryFinding]:
        """Run regulatory analysis using the regulatory module"""
        # Use the segmentation method to identify applicable frameworks
        result = self.regulatory_module._build_segmentation_according_to_the_regulatory_and_geographical_extent_of_questions_as_follows_(text)
        findings = []

        for reg in result.get("applicable_regulations", []):
            findings.append(RegulatoryFinding(
                regulation_type=reg["framework"],
                description=reg["description"],
                severity="high" if reg.get("requires_approval") else "moderate",
                evidence=f"Framework identified: {reg['framework']}",
                jurisdiction=reg.get("jurisdiction", "USA"),
                requires_approval=reg.get("requires_approval", False)
            ))

        return findings

    def _extract_context(self, text: str) -> Dict:
        """Extract context flags for risk assessment"""
        context = {}
        context["has_indemnification_cap"] = bool(re.search(r'indemnification\s+cap|cap\s+on\s+indemnif', text, re.IGNORECASE))
        context["has_escrow"] = bool(re.search(r'\bescrow\b', text, re.IGNORECASE))
        context["has_rwi"] = bool(re.search(r'representation\s+and\s+warranty\s+insurance|rwi', text, re.IGNORECASE))
        context["has_disclosure_schedules"] = bool(re.search(r'disclosure\s+schedule|schedule\s+\d+', text, re.IGNORECASE))
        context["has_financial_statements"] = bool(re.search(r'audited\s+financial\s+statements', text, re.IGNORECASE))
        context["has_regulatory_filings"] = bool(re.search(r'hsr|cfius|form\s+s-4|form\s+s-3', text, re.IGNORECASE))
        return context

    def _calculate_overall_risk_score(self, red_flags: List[RiskFinding], litigation_risks: List) -> float:
        """Calculate overall risk score (0-100, lower = riskier)"""
        base_score = 100

        # Deduct for red flags
        for flag in red_flags:
            if flag.severity == "critical":
                base_score -= 15
            elif flag.severity == "high":
                base_score -= 10
            elif flag.severity == "moderate":
                base_score -= 5
            elif flag.severity == "low":
                base_score -= 2

        # Deduct for litigation risks
        for risk in litigation_risks:
            if risk.risk_level == RiskLevel.CRITICAL:
                base_score -= 10
            elif risk.risk_level == RiskLevel.HIGH:
                base_score -= 7
            elif risk.risk_level == RiskLevel.MODERATE:
                base_score -= 3

        return max(0, base_score)


# Import re for regex
import re

# Import RiskLevel and ConfidenceLevel from litigation module
from litigation_risk_assessment import RiskLevel, ConfidenceLevel


def run_full_analysis(documents: Dict[str, str]) -> AnalysisResult:
    """
    Main entry point for full M&A document analysis.

    Args:
        documents: Dict of {document_name: text_content}

    Returns:
        AnalysisResult with all findings from all modules
    """
    pipeline = HydraforgeAnalysisPipeline()

    if len(documents) == 1:
        doc_name, text = list(documents.items())[0]
        return pipeline.analyze_single_document(text, doc_name)
    else:
        return pipeline.analyze_multiple_documents(documents)


def get_executive_summary(result: AnalysisResult) -> str:
    """Generate executive summary from analysis result"""
    parts = []

    # Overall score
    score = result.overall_risk_score
    if score >= 80:
        rating = "LOW RISK"
    elif score >= 60:
        rating = "MODERATE RISK"
    elif score >= 40:
        rating = "HIGH RISK"
    else:
        rating = "CRITICAL RISK"

    parts.append(f"Overall Risk Score: {score:.1f}/100 ({rating})")

    # Key findings
    critical_flags = [f for f in result.red_flags if f.get("severity") == "critical"]
    if critical_flags:
        parts.append(f"\n🔴 CRITICAL FINDINGS ({len(critical_flags)}):")
        for flag in critical_flags[:3]:
            parts.append(f"  - {flag.get('category')}: {flag.get('specific_issue')}")

    # Litigation summary
    lit_summary = result.litigation_summary
    if lit_summary.get("by_risk_level", {}).get("critical", 0) > 0:
        parts.append(f"\n⚖️ LITIGATION RISK: {lit_summary['by_risk_level']['critical']} critical areas")

    # Regulatory
    reg_count = len(result.regulatory_findings)
    if reg_count > 0:
        parts.append(f"\n📋 REGULATORY: {reg_count} frameworks identified")

    # Cross-document
    cross_doc = len(result.cross_document_findings)
    if cross_doc > 0:
        parts.append(f"\n🔗 CROSS-DOCUMENT: {cross_doc} consistency issues")

    return "\n".join(parts)


if __name__ == "__main__":
    # Demo usage
    sample_docs = {
        "merger_agreement": """
        MERGER AGREEMENT

        This Agreement is made as of January 15, 2024 between Buyer Corp ("Buyer") and Seller Inc ("Seller").

        "Material Adverse Effect" means any effect that is materially adverse to the business...

        The purchase price shall be $100,000,000 subject to working capital adjustment.
        An escrow of $10,000,000 shall be established...

        Seller represents that there are no pending litigations...
        """
    }

    result = run_full_analysis(sample_docs)
    print(get_executive_summary(result))