# red_flag_engine.py
"""
Red Flag Engine

Detects critical risks based on contractual language analysis.
Implements the 24-category approach from the spec with market-standard safety checks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Set, Tuple


class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"


@dataclass
class RiskFinding:
    """Single risk finding with classification and suggested fix"""
    category: str
    specific_issue: str
    severity: str
    context_span: str
    suggested_fix: str


class RedFlagEngine:
    """
    Engine for detecting material risks in M&A contracts.
    Marks findings as CRITICAL if they meet the NULLIFICATION GATE criteria.
    """

    def __init__(self, context_snippet: str = ""):
        self.context_patterns = self._build_context_patterns(context_snippet)

        # Pre-compile regex patterns for performance
        self._compile_patterns()

    def _compile_patterns(self) -> None:
        """Compile regex patterns for performance optimization"""
        self.cognitive_riser_patterns = self._compile_regex([
            r'\b(?:so\s+called|what\s+is\s+known\s+as|purports|appears|fails\+to\s+demonstrate)\b.*?\b(material\s+adverse|risk|obligation|liability)\b',
            r'\b(not\s+properly\s+qualified\s+)?(?:representations?|warranties?|obligations?)\b.*\b(material|substantial|significant)\b',
            r'\b(potentially\s+subject\s+to\s+change|may\s+subject\s+to\s+change|expected\s+to|is\s+expected\s+to)\b.*?\b(material|substantial|significant)\b',
        ])

        self.amendment_patterns = self._compile_regex([
            r'\b(?:amended\s+by|agreement\s+may\s+be\s+amended\s+by\s+written\s+consent\s+of)\b',
            r'\b(no\s+further\s+amendments\s+without\s+mutual\s+written\s+consent)\b',
        ])

    def _compile_regex(self, patterns: List[str]) -> List[re.Pattern]:
        """Compile regex patterns for performance optimization"""
        return [re.compile(pattern, re.IGNORECASE) for pattern in patterns]

    def _extract_context(self, text: str, idx: int, radius: int = 100) -> str:
        """Extract surrounding context for a found keyword"""
        start = max(0, idx - radius)
        end = min(len(text), idx + radius)
        return text[start:end].strip()

    def detect_complex_obligations(self, text: str) -> List[RiskFinding]:
        """Detect complex obligations that indicate risk exposure"""
        findings = []
        all_patterns = [
            ('cognitive_riser', self.cognitive_riser_patterns),
            ('amendment', self.amendment_patterns),
        ]

        for pattern_type, patterns in all_patterns:
            for pattern_obj in patterns:
                for match in pattern_obj.finditer(text):
                    context = self._extract_context(text, match.start(), 150)
                    severity = Severity.CRITICAL if any(word in text.lower() for word in ['restricted', 'blocked', 'ultra', 'exceeding']) else Severity.MODERATE

                    findings.append(RiskFinding(
                        category=pattern_type,
                        specific_issue=f"Complex obligation pattern detected",
                        severity=severity.value,
                        context_span=context,
                        suggested_fix='Review against market standards for this contract type'
                    ))
        return findings

    def detect_language_conflicts(self, text: str) -> List[RiskFinding]:
        """Detect language conflicts and market traps"""
        findings = []

        traps = [
            (r'waive\s+any\s+claim\s+(?:and\s+related\s+causes)', Severity.HIGH),
            (r'\bwaive\s+any\s+right\s+to\s+sue\b', Severity.HIGH),
            (r'\b(bus\s+entity\s+may\s+terminate\s+agreement\s+for\s+any\s+reason)', Severity.HIGH),
        ]

        for pattern, severity in traps:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                findings.append(RiskFinding(
                    category='asymmetric_termination_or_waiver',
                    specific_issue='One-way termination or waiver language detected',
                    severity=severity.value,
                    context_span=self._extract_context(text, match.start()),
                    suggested_fix='Ensure bilateral termination rights'
                ))
        return findings

    def detect_vague_language(self, text: str) -> List[RiskFinding]:
        """Identify potentially inaccurate or vague language"""
        findings = []
        vague_terms = [
            (r'\b(believe|consider)\s+(?:that|it\s+is\s+believed)\b', 'vague_belief_language'),
            (r'\b(?:does\s+not\s+constitute\s+a\s+problem|does\s+not\s+impose\s+any\s+obligation)\b', 'overly_broad_disclaimer'),
            (r'\bto\s+the\s+best\s+of\s+our\s+knowledge\b', 'knowledge_qualifier'),
        ]

        for pattern, category in vague_terms:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                findings.append(RiskFinding(
                    category=category,
                    specific_issue='Potentially vague language detected',
                    severity=Severity.MODERATE.value,
                    context_span=self._extract_context(text, match.start()),
                    suggested_fix='Replace vague qualifiers with precise definitions'
                ))
        return findings

    def _build_context_patterns(self, context_snippet: str) -> Dict[str, List[re.Pattern]]:
        """Build context-specific search patterns"""
        patterns = {}
        if context_snippet:
            for label, pattern in [
                ('approach_termination', r'res|cause\s+to\s+terminate'),
                ('market_risk', r'market\s+(?:crash|crashes|down|collapse)'),
                ('regulatory_triggers', r'\b(federal\s+agenc|regulat)'),
            ]:
                patterns[label] = [re.compile(pattern, re.IGNORECASE)]
        return patterns

    def is_word_in_context(self, word: str, context_text: str) -> bool:
        """Check if a word appears in context (case-insensitive)"""
        return bool(re.search(re.escape(word), context_text, re.IGNORECASE))

    @property
    def required_categories(self) -> List[str]:
        """List of all mandatory risk categories"""
        return [
            'valuation_and_earnout',
            'knowledge_gap',
            'executive_decision_process',
            'evidence_in_insufficient',
            'liability_chain',
            'termination_conditions',
        ]

    def run_full_analysis(self, text: str) -> List[RiskFinding]:
        """Run complete red flag analysis"""
        findings = []
        findings.extend(self.detect_complex_obligations(text))
        findings.extend(self.detect_language_conflicts(text))
        findings.extend(self.detect_vague_language(text))
        return findings


def build_red_flag_engine(context_snippet: str = "") -> RedFlagEngine:
    """Factory function to instantiate RedFlagEngine with context awareness."""
    return RedFlagEngine(context_snippet=context_snippet)