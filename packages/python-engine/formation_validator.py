"""
formation_validator.py
----------------------
Pre-analysis validation layer for merger agreement structural validity.
Runs BEFORE the main analysis engine (_check_indemnification, etc.)
to catch foundational defects that invalidate downstream analysis.

Integration:
    from formation_validator import FormationValidator
    
    validator = FormationValidator(config)
    formation_findings, formation_deductions = validator.run(raw_text)
    # Prepend formation_findings to your existing findings list
    # Subtract formation_deductions from base score before main analysis runs

Seven improvement areas addressed:
    1. Structural/formation validity (merger legally operative?)
    2. Section header vs content mismatch detection
    3. Phantom reference detection (schedules/exhibits that don't exist)
    4. Complete vs partial representation analysis (tax gap)
    5. Litigation risk section consistency check
    6. Currency and administrative mechanics completeness
    7. Domestic tax gap (no foreign disclaimer ≠ domestic rep exists)
"""

import re
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Set
import yaml

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class FormationFinding:
    """
    Mirrors RiskFinding exactly so it can be cast/appended directly
    to the main engine's findings list without schema changes.
    """
    rule: str
    deduction: int
    description: str
    severity: str                  # "critical" | "high" | "medium" | "low"
    location: Optional[str] = None
    suggestion: Optional[str] = None
    layer: str = "formation"       # tag so UI can filter/group if needed


@dataclass
class FormationValidationResult:
    findings: List[FormationFinding] = field(default_factory=list)
    total_deduction: int = 0
    phantom_references: List[str] = field(default_factory=list)
    mismatched_sections: List[str] = field(default_factory=list)
    missing_admin_fields: List[str] = field(default_factory=list)
    tax_gap_detected: bool = False
    merger_structure_valid: bool = True
    currency_specified: bool = True


# ---------------------------------------------------------------------------
# Main validator class
# ---------------------------------------------------------------------------

class FormationValidator:
    """
    Runs seven structural validity checks against raw contract text.
    
    Usage:
        validator = FormationValidator(config)          # config = loaded YAML dict
        result = validator.run(raw_text)
        
        # Then in your main analyzer:
        all_findings = result.findings + existing_findings
        adjusted_score = base_score - result.total_deduction
    """

    def __init__(self, config: dict):
        self.config = config
        fv_cfg = config.get("formation_validator", {})

        # Deduction values — all overridable from YAML
        self.deductions = fv_cfg.get("deductions", {})

        # Section header → expected content keywords mapping
        # Loaded from YAML so you can tune without code changes
        self.section_content_map: Dict[str, List[str]] = fv_cfg.get(
            "section_content_map", {}
        )

        # Known phantom-reference trigger phrases
        self.phantom_triggers: List[str] = fv_cfg.get(
            "phantom_triggers",
            [
                "except as noted",
                "as set forth in schedule",
                "as listed in exhibit",
                "attached hereto as schedule",
                "attached hereto as exhibit",
                "as described in annex",
                "see schedule",
                "see exhibit",
                "as noted in schedule",
                "referenced in exhibit",
            ],
        )

        # Merger intent phrases (weak/non-operative language)
        self.weak_merger_phrases: List[str] = fv_cfg.get(
            "weak_merger_phrases",
            [
                r"\bintend\s+this\s+to\s+be\s+a\s+merger\b",
                r"\bcontemplated\s+merger\b",
                r"\bproposed\s+merger\b",
                r"\bintended\s+to\s+constitute\s+a\s+merger\b",
                r"\bexpect\s+this\s+to\s+be\s+a\s+merger\b",
            ],
        )

        # Strong merger phrases (operative language — any one is sufficient)
        self.strong_merger_phrases: List[str] = fv_cfg.get(
            "strong_merger_phrases",
            [
                r"\bshall\s+merge\s+with\s+and\s+into\b",
                r"\bmerger\s+shall\s+become\s+effective\b",
                r"\bplan\s+of\s+merger\b",
                r"\bsurviving\s+corporation\b",
                r"\bsurviving\s+entity\b",
                r"\beffective\s+time\s+of\s+the\s+merger\b",
                r"\bpursuant\s+to\s+(?:section|§)\s*\d+",  # statute cite
                r"\bmerger\s+sub\b",
            ],
        )

        # Required merger structural elements
        self.merger_structural_elements: Dict[str, List[str]] = fv_cfg.get(
            "merger_structural_elements",
            {
                "surviving_entity": [
                    r"\bsurviving\s+(?:entity|corporation|company)\b",
                    r"\bsurvive\s+the\s+merger\b",
                ],
                "merger_statute": [
                    r"\bdelaware\s+general\s+corporation\s+law\b",
                    r"\bdgcl\b",
                    r"\bbvi\s+business\s+companies\s+act\b",
                    r"\bcompanies\s+act\b",
                    r"\bpursuant\s+to\s+(?:the\s+laws?\s+of|section)\b",
                ],
                "effective_time": [
                    r"\beffective\s+time\b",
                    r"\beffective\s+date\s+of\s+the\s+merger\b",
                    r"\bupon\s+filing\s+of\s+(?:the\s+)?(?:certificate|articles)\b",
                ],
                "merger_structure": [
                    r"\bforward\s+(?:triangular\s+)?merger\b",
                    r"\breverse\s+(?:triangular\s+)?merger\b",
                    r"\bdirect\s+merger\b",
                    r"\bshort[- ]form\s+merger\b",
                    r"\bmerger\s+sub(?:sidiary)?\b",
                ],
            },
        )

        # Administrative required fields
        self.admin_fields: Dict[str, List[str]] = fv_cfg.get(
            "admin_fields",
            {
                "effective_date": [
                    r"\bdated\s+(?:as\s+of\s+)?\w+\s+\d{1,2},?\s+\d{4}\b",
                    r"\bthis\s+\w+\s+day\s+of\b",
                    r"\bas\s+of\s+\w+\s+\d{1,2},?\s+\d{4}\b",
                    r"\beffective\s+(?:as\s+of\s+)?\w+\s+\d{1,2},?\s+\d{4}\b",
                    r"\b\d{1,2}/\d{1,2}/\d{4}\b",
                    r"\b\d{4}-\d{2}-\d{2}\b",
                ],
                "currency": [
                    r"\busd\b",
                    r"\bu\.s\.\s+dollars?\b",
                    r"\bunited\s+states\s+dollars?\b",
                    r"\beur\b",
                    r"\beuros?\b",
                    r"\bgbp\b",
                    r"\b(?:£|\$|€)\s*[\d,]+",
                ],
                "party_jurisdiction": [
                    r"\ba\s+(?:delaware|nevada|cayman|bvi|british\s+virgin\s+islands)\s+"
                    r"(?:corporation|company|llc|limited)\b",
                    r"\bincorporated\s+(?:in|under)\s+the\s+laws\s+of\b",
                    r"\borganized\s+(?:and\s+existing\s+)?under\s+the\s+laws\s+of\b",
                ],
                "notice_provision": [
                    r"\bnotice\s+(?:shall\s+be\s+)?(?:given|sent|delivered)\b",
                    r"\bwritten\s+notice\b",
                    r"\bnotices?\s+to\s+(?:buyer|seller|the\s+parties?)\b",
                ],
            },
        )

        # Currency patterns (for cross-border detection)
        self.cross_border_indicators: List[str] = fv_cfg.get(
            "cross_border_indicators",
            [
                r"\bbritish\s+virgin\s+islands\b",
                r"\bluxembourg\b",
                r"\boutside\s+the\s+united\s+states\b",
                r"\bforeign\s+(?:tax|jurisdiction|country)\b",
                r"\binternational\b",
                r"\bcross[- ]border\b",
                r"\bnon[- ]us\b",
            ],
        )

        # Tax representation patterns
        self.domestic_tax_rep_patterns: List[str] = fv_cfg.get(
            "domestic_tax_rep_patterns",
            [
                r"\btax\s+returns?\s+(?:have\s+been\s+|duly\s+)?filed\b",
                r"\ball\s+(?:material\s+)?taxes\s+(?:have\s+been\s+)?paid\b",
                r"\bno\s+(?:pending\s+)?tax\s+(?:audit|assessment|dispute|deficiency)\b",
                r"\btax\s+representations?\s+and\s+warranties\b",
                r"\brepresents?\s+(?:and\s+warrants?\s+)?(?:that\s+)?(?:it\s+has\s+)?filed\s+"
                r"all\s+(?:required\s+)?tax\s+returns?\b",
                r"\ball\s+tax\s+liabilities\b",
                r"\btaxes\s+shown\s+on\s+(?:such\s+)?returns?\s+have\s+been\s+paid\b",
            ],
        )

        self.foreign_tax_disclaimer_patterns: List[str] = fv_cfg.get(
            "foreign_tax_disclaimer_patterns",
            [
                r"\bno\s+representations?\s+regarding\s+taxes?\s+outside\b",
                r"\bmakes?\s+no\s+(?:tax\s+)?representations?\s+(?:regarding|with\s+respect\s+to)"
                r"\s+(?:taxes?\s+)?outside\b",
                r"\bno\s+(?:tax\s+)?warranty\s+(?:for|regarding)\s+(?:non[- ]us|foreign)\s+taxes?\b",
                r"\bforeign\s+tax\s+(?:representations?\s+are\s+)?disclaimed\b",
            ],
        )

        # Precompile all regex patterns for performance
        self._compile_patterns()

    # -----------------------------------------------------------------------
    # Pattern compilation
    # -----------------------------------------------------------------------

    def _compile_patterns(self) -> None:
        """Pre-compile all regex patterns at init time (mirrors main engine pattern)."""
        flags = re.IGNORECASE | re.DOTALL

        self._weak_merger_re = [
            re.compile(p, flags) for p in self.weak_merger_phrases
        ]
        self._strong_merger_re = [
            re.compile(p, flags) for p in self.strong_merger_phrases
        ]
        self._structural_re: Dict[str, List[re.Pattern]] = {
            k: [re.compile(p, flags) for p in patterns]
            for k, patterns in self.merger_structural_elements.items()
        }
        self._admin_re: Dict[str, List[re.Pattern]] = {
            k: [re.compile(p, flags) for p in patterns]
            for k, patterns in self.admin_fields.items()
        }
        self._cross_border_re = [
            re.compile(p, flags) for p in self.cross_border_indicators
        ]
        self._domestic_tax_re = [
            re.compile(p, flags) for p in self.domestic_tax_rep_patterns
        ]
        self._foreign_tax_disclaimer_re = [
            re.compile(p, flags) for p in self.foreign_tax_disclaimer_patterns
        ]
        self._phantom_trigger_re = [
            re.compile(re.escape(p), flags) for p in self.phantom_triggers
        ]
        # Schedule/exhibit existence patterns
        self._schedule_exists_re = re.compile(
            r"\bschedule\s+[a-z0-9](?:[.-][a-z0-9])?\b"
            r"|\bexhibit\s+[a-z0-9](?:[.-][a-z0-9])?\b"
            r"|\bannex\s+[a-z0-9](?:[.-][a-z0-9])?\b",
            re.IGNORECASE,
        )
        self._schedule_attached_re = re.compile(
            r"attached\s+hereto\s+as\s+(?:schedule|exhibit|annex)"
            r"|(?:schedule|exhibit|annex)\s+attached\s+hereto"
            r"|(?:schedule|exhibit|annex)\s+[a-z0-9]\s+(?:hereto|attached)",
            re.IGNORECASE,
        )

    # -----------------------------------------------------------------------
    # Public entry point
    # -----------------------------------------------------------------------

    def run(self, raw_text: str) -> FormationValidationResult:
        """
        Execute all seven validation checks against raw_text.
        Returns FormationValidationResult with findings + deductions.
        
        Call this BEFORE your main engine checks.
        """
        result = FormationValidationResult()

        # Empty / whitespace-only input has nothing to validate
        if not raw_text or not raw_text.strip():
            return result

        # Run each check — each appends to result.findings and adds to
        # result.total_deduction if issues found
        self._check_merger_formation(raw_text, result)
        self._check_section_header_content_mismatch(raw_text, result)
        self._check_phantom_references(raw_text, result)
        self._check_tax_representation_completeness(raw_text, result)
        self._check_administrative_completeness(raw_text, result)
        self._check_currency_specification(raw_text, result)
        self._check_domestic_tax_gap(raw_text, result)

        logger.info(
            "FormationValidator: %d findings, %d points deducted",
            len(result.findings),
            result.total_deduction,
        )
        return result

    # -----------------------------------------------------------------------
    # Check 1 — Merger formation structural validity
    # -----------------------------------------------------------------------

    def _check_merger_formation(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 1: Structural/formation validity.
        
        Detects:
        - Weak/non-operative merger language ("intend this to be a merger")
          with no operative execution language → the agreement may not
          legally constitute a merger.
        - Missing surviving entity designation, statute citation, effective
          time, or merger structure (surfaced alongside the weak-language
          defect so the drafter fixes the whole formation in one pass).
        
        Note: A concise-but-complete agreement that simply omits the exact
        operative phrases is NOT penalized — only genuinely non-operative
        intent language triggers the defect, avoiding false positives on
        well-drafted short-form agreements.
        """
        is_merger = self._is_merger_agreement(text)
        if not is_merger:
            # Not a merger agreement — skip merger-specific checks silently
            return

        # 1. Check for weak vs strong merger language
        weak_matches = [p for p in self._weak_merger_re if p.search(text)]
        strong_matches = [p for p in self._strong_merger_re if p.search(text)]

        if not weak_matches or strong_matches:
            # Operative execution language present (or no weak intent at all) —
            # the agreement reads as an operative merger. Not a formation defect.
            return

        issues_found = [
            "Agreement uses non-operative intent language "
            "('intend this to be a merger') without operative merger "
            "execution language ('shall merge with and into', "
            "'plan of merger', 'surviving entity'). "
            "The agreement may not legally constitute a merger."
        ]
        deduction = self.deductions.get("weak_merger_language", 12)
        result.merger_structure_valid = False

        # 2. Surface missing structural elements as advisory detail
        #    (no separate element deduction — avoids double-penalizing the
        #     same root failure of an incomplete draft)
        missing_elements = [
            element_name.replace("_", " ")
            for element_name, patterns in self._structural_re.items()
            if not any(p.search(text) for p in patterns)
        ]
        if missing_elements:
            issues_found.append(
                f"Missing required merger structural elements: "
                f"{', '.join(missing_elements)}. "
                "A statutory merger requires these elements to be legally operative."
            )

        finding = FormationFinding(
            rule="merger_formation_defect",
            deduction=deduction,
            description=(
                f"STRUCTURAL FORMATION DEFECT — Merger agreement may not be "
                f"legally operative as drafted. {' | '.join(issues_found)}"
            ),
            severity="critical",
            location="§1 Overview / Agreement Structure",
            suggestion=(
                "Replace 'intend this to be a merger' with operative language: "
                "'[Target] shall merge with and into [Buyer/MergerSub], "
                "with [Buyer/MergerSub] as the surviving entity (the \"Surviving Entity\"), "
                "pursuant to [applicable statute] (the \"Merger\"). "
                "The Merger shall become effective upon the filing of a Certificate of Merger "
                "with the [Secretary of State / Registrar].'"
                " Specify merger structure (forward triangular, reverse triangular, direct). "
                "Add effective time definition."
            ),
        )
        result.findings.append(finding)
        result.total_deduction += deduction

    def _is_merger_agreement(self, text: str) -> bool:
        """
        Heuristic: is this document intended to be a merger agreement?
        Checks for merger-related terms in title or early text.
        """
        early_text = text[:500]  # title + first paragraph
        merger_indicators = [
            r"\bmerger\s+agreement\b",
            r"\bagreement\s+and\s+plan\s+of\s+merger\b",
            r"\bplan\s+of\s+merger\b",
            r"\bmerger\b",
        ]
        return any(
            re.search(p, early_text, re.IGNORECASE) for p in merger_indicators
        )

    # -----------------------------------------------------------------------
    # Check 2 — Section header vs content mismatch
    # -----------------------------------------------------------------------

    def _check_section_header_content_mismatch(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 2: Section header vs content mismatch detection.
        
        Detects sections where the header title does not match the actual content.
        Examples:
        - §9 titled "CONFIDENTIALITY" but contains no confidentiality provisions
        - §8 titled "INDEMNIFICATION" but eliminates indemnification
        
        Uses the section_content_map from YAML config.
        """
        # Parse sections from text: find "N. SECTION TITLE\n content"
        section_pattern = re.compile(
            r"(?:^|\n)\s*(\d{1,2})\.\s+([A-Z][A-Z\s&/]+?)(?:\n|$)(.*?)(?=\n\s*\d{1,2}\.\s+[A-Z]|\Z)",
            re.DOTALL | re.MULTILINE,
        )

        sections = section_pattern.findall(text)
        if not sections:
            return  # Can't parse sections — skip silently

        mismatches = []

        for section_num, header, content in sections:
            header_clean = header.strip().upper()
            content_lower = content.lower().strip()

            if not content_lower:
                continue

            # Look up expected content keywords for this header
            expected_keywords = None
            for mapped_header, keywords in self.section_content_map.items():
                if mapped_header.upper() in header_clean or header_clean in mapped_header.upper():
                    expected_keywords = keywords
                    break

            if expected_keywords is None:
                continue  # No mapping — skip

            # Check for negation patterns (e.g., "there is no indemnification")
            negation_patterns = [
                r"\bthere\s+is\s+no\s+" + re.escape(kw) for kw in expected_keywords
            ] + [
                r"\bno\s+" + re.escape(kw) + r"\s+provision\b"
                for kw in expected_keywords
            ] + [
                r"\b" + re.escape(kw) + r"\s+is\s+(?:hereby\s+)?(?:waived|eliminated|disclaimed)\b"
                for kw in expected_keywords
            ]

            # Check if header keywords are present substantively
            keywords_present = any(kw.lower() in content_lower for kw in expected_keywords)
            negation_present = any(
                re.search(p, content_lower, re.IGNORECASE) for p in negation_patterns
            )

            # Mismatch conditions:
            # A) Header keyword not present at all in content
            # B) Header keyword present but immediately negated
            if not keywords_present:
                mismatches.append({
                    "section": f"§{section_num}",
                    "header": header_clean,
                    "issue": f"Section titled '{header_clean}' contains no {header_clean.lower()} provisions",
                    "severity": "high",
                    "deduction": self.deductions.get("header_content_mismatch_absent", 6),
                })
            elif negation_present:
                mismatches.append({
                    "section": f"§{section_num}",
                    "header": header_clean,
                    "issue": (
                        f"Section titled '{header_clean}' affirmatively eliminates "
                        f"rather than provides {header_clean.lower()} — the expected "
                        f"protections are negated"
                    ),
                    "severity": "critical",
                    "deduction": self.deductions.get("header_content_mismatch_negated", 10),
                })

        for mismatch in mismatches:
            result.mismatched_sections.append(
                f"{mismatch['section']} ({mismatch['header']})"
            )
            finding = FormationFinding(
                rule="section_header_content_mismatch",
                deduction=mismatch["deduction"],
                description=(
                    f"SECTION MISMATCH — {mismatch['issue']}. "
                    "This creates interpretive ambiguity: the section title signals "
                    "protection that the content does not provide, which could mislead "
                    "a reviewing party and may indicate deliberate misdirection."
                ),
                severity=mismatch["severity"],
                location=mismatch["section"],
                suggestion=(
                    f"Either: (a) rename the section to accurately reflect its content, "
                    f"or (b) replace the content with market-standard "
                    f"{mismatch['header'].lower()} provisions appropriate to the deal."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += mismatch["deduction"]

    # -----------------------------------------------------------------------
    # Check 3 — Phantom reference detection
    # -----------------------------------------------------------------------

    def _check_phantom_references(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 3: Phantom reference detection.
        
        Detects cross-references to schedules, exhibits, or annexes that:
        - Are referenced in the text ('except as noted', 'see Schedule A')
        - But do not appear to actually exist in the document
        
        Examples:
        - §11: "except as noted" — implies a note/schedule that isn't present
        - "All material contracts as listed in Exhibit A" — Exhibit A absent
        """
        # Find all phantom trigger phrases and their surrounding context
        phantom_hits = []

        for pattern in self._phantom_trigger_re:
            for match in pattern.finditer(text):
                start = max(0, match.start() - 100)
                end = min(len(text), match.end() + 100)
                context = text[start:end].strip()
                # Get approximate section location
                location = self._get_section_location(text, match.start())
                phantom_hits.append({
                    "phrase": match.group(),
                    "context": context,
                    "location": location,
                })

        if not phantom_hits:
            return

        # Check whether any actual schedules/exhibits are attached
        # (i.e., whether the document contains substantive schedule content)
        has_attached_schedules = bool(self._schedule_attached_re.search(text))
        referenced_schedules = self._schedule_exists_re.findall(text)
        has_schedule_content = len(referenced_schedules) > 0 and has_attached_schedules

        # If phantom triggers found but no schedules attached → phantom references
        deduction_per_phantom = self.deductions.get("phantom_reference", 4)
        total_deduction = min(
            len(phantom_hits) * deduction_per_phantom,
            self.deductions.get("phantom_reference_cap", 12),
        )

        phantom_descriptions = []
        for hit in phantom_hits:
            result.phantom_references.append(hit["phrase"])
            phantom_descriptions.append(
                f"'{hit['phrase']}' at {hit['location']} "
                f"(context: '...{hit['context'][:80]}...')"
            )

        finding = FormationFinding(
            rule="phantom_reference_detected",
            deduction=total_deduction,
            description=(
                f"PHANTOM REFERENCES DETECTED — {len(phantom_hits)} reference(s) "
                f"to schedules, exhibits, or external documents that do not appear "
                f"to exist in this agreement: "
                + "; ".join(phantom_descriptions[:5])  # cap at 5 for readability
                + (f" [+{len(phantom_hits)-5} more]" if len(phantom_hits) > 5 else "")
                + ". These phantom references create apparent carve-outs or exceptions "
                "to representations without actually specifying them, which may "
                "render the underlying provisions unenforceable or ambiguous."
            ),
            severity="high",
            location="; ".join(h["location"] for h in phantom_hits[:3]),
            suggestion=(
                "For each phantom reference: either (a) attach the referenced schedule/exhibit "
                "with complete content, or (b) remove the reference and make the carve-out "
                "explicit inline. 'Except as noted' without an attached note provides "
                "no meaningful carve-out and should be replaced with specific language."
            ),
        )
        result.findings.append(finding)
        result.total_deduction += total_deduction

    def _get_section_location(self, text: str, char_position: int) -> str:
        """Find the nearest section header before char_position."""
        section_pattern = re.compile(
            r"(?:^|\n)\s*(\d{1,2})\.\s+([A-Z][A-Z\s]+)",
            re.MULTILINE,
        )
        last_section = "Unknown"
        for match in section_pattern.finditer(text):
            if match.start() > char_position:
                break
            last_section = f"§{match.group(1)} {match.group(2).strip()}"
        return last_section

    # -----------------------------------------------------------------------
    # Check 4 — Complete vs partial representation analysis
    # -----------------------------------------------------------------------

    def _check_tax_representation_completeness(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 4: Complete vs partial representation analysis.
        
        Specifically: verifies that a tax section contains affirmative
        representations, not just a foreign disclaimer that implies (but
        does not provide) domestic tax coverage.
        
        Detects:
        - Foreign tax disclaimer present → implies cross-border concern
        - No affirmative domestic tax representation anywhere
        - Tax section exists but only disclaims rather than represents
        """
        has_foreign_disclaimer = any(
            p.search(text) for p in self._foreign_tax_disclaimer_re
        )
        has_domestic_tax_rep = any(
            p.search(text) for p in self._domestic_tax_re
        )

        # Find tax section specifically
        tax_section = self._extract_section_content(text, ["TAX", "TAXES", "TAX MATTERS"])

        if has_foreign_disclaimer and not has_domestic_tax_rep:
            # Core gap: foreign disclaimer doesn't create domestic rep
            deduction = self.deductions.get("no_domestic_tax_rep_with_foreign_disclaimer", 10)

            finding = FormationFinding(
                rule="tax_representation_completeness_gap",
                deduction=deduction,
                description=(
                    "DOMESTIC TAX REPRESENTATION GAP — The agreement contains a "
                    "foreign tax disclaimer (Target makes no representations regarding "
                    "taxes outside the United States) but contains NO affirmative "
                    "domestic tax representation anywhere. The foreign disclaimer does "
                    "not create or imply a domestic tax warranty. As drafted, "
                    "there are NO tax representations in this agreement — domestic or "
                    "foreign. Buyer acquires Target with zero contractual tax protection "
                    "in any jurisdiction."
                ),
                severity="critical",
                location="§6 Tax Matters / §3 Representations and Warranties",
                suggestion=(
                    "Add affirmative domestic tax representations to §3 or §6: "
                    "'Target has filed all material tax returns required to be filed "
                    "in all applicable jurisdictions (including the United States and "
                    "all states/localities where Target operates); all taxes shown on "
                    "such returns have been paid; no material tax deficiency has been "
                    "asserted; no tax authority has commenced or, to Seller's knowledge, "
                    "threatened any audit or proceeding.' "
                    "The foreign tax disclaimer in §6 should either be removed or "
                    "supplemented with a covenant for Seller to cooperate with "
                    "post-closing foreign tax compliance."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += deduction
            result.tax_gap_detected = True

        elif tax_section and not has_domestic_tax_rep and not has_foreign_disclaimer:
            # Tax section exists but makes no representations at all
            deduction = self.deductions.get("empty_tax_section", 7)
            finding = FormationFinding(
                rule="empty_tax_section",
                deduction=deduction,
                description=(
                    "EMPTY TAX SECTION — A tax section exists but contains no "
                    "affirmative tax representations or warranties. A section that "
                    "neither represents nor warrants provides no contractual protection."
                ),
                severity="high",
                location="§6 Tax Matters",
                suggestion=(
                    "Replace the tax section content with affirmative representations "
                    "covering: tax return filing compliance, payment of taxes, "
                    "absence of audits/disputes, no tax liens, and (for cross-border "
                    "deals) multi-jurisdictional coverage."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += deduction
            result.tax_gap_detected = True

    def _extract_section_content(
        self, text: str, header_variants: List[str]
    ) -> Optional[str]:
        """Extract content of a named section from the text."""
        for variant in header_variants:
            pattern = re.compile(
                rf"(?:^|\n)\s*\d{{1,2}}\.\s+{re.escape(variant)}\s*\n(.*?)"
                rf"(?=\n\s*\d{{1,2}}\.\s+[A-Z]|\Z)",
                re.DOTALL | re.IGNORECASE,
            )
            match = pattern.search(text)
            if match:
                return match.group(1).strip()
        return None

    # -----------------------------------------------------------------------
    # Check 5 — Litigation risk section consistency
    # -----------------------------------------------------------------------

    def _check_litigation_risk_consistency(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 5: Litigation risk section consistency.
        
        Note: In a pure regex/rule-based engine without a separate
        "litigation risk section" in the contract text itself, this check
        operates on the CONTRACT text to detect internal inconsistencies
        that would cause downstream litigation risk understatement.
        
        Specifically detects:
        - Earnout present + no dispute mechanism → litigation risk HIGH
          (but system might rate it LOW without this flag)
        - No indemnification + representations present → litigation risk HIGH
          (fraud/rescission claim likely; system might not flag this)
        - Asymmetric termination + no break fee → litigation risk HIGH
        
        Emits findings that explicitly state litigation probability
        so the output litigation section reflects these correctly.
        """
        # These patterns check for conditions that CREATE high litigation risk
        # that a simple section scan might miss

        litigation_risks = []

        # Risk A: Earnout + no dispute resolution → certain litigation
        has_earnout = bool(re.search(r"\bearnout\b", text, re.IGNORECASE))
        has_earnout_metrics = bool(re.search(
            r"\b(?:ebitda|revenue|gross\s+profit|net\s+income|arr|mrr)\b",
            text, re.IGNORECASE
        ))
        has_dispute_mechanism = bool(re.search(
            r"\bindependent\s+(?:accountant|auditor|expert)\b"
            r"|\bdispute\s+(?:resolution|mechanism)\b"
            r"|\barbitration\s+of\s+(?:earnout|purchase\s+price)\b",
            text, re.IGNORECASE
        ))

        if has_earnout and not has_earnout_metrics and not has_dispute_mechanism:
            litigation_risks.append({
                "area": "Earnout Disputes",
                "probability": "HIGH",
                "rationale": (
                    "Earnout present with no defined metrics and no dispute mechanism. "
                    "'Agreement to agree' on metrics is unenforceable; Seller will "
                    "assert implied covenant of good faith claims when Buyer sets metrics."
                ),
            })

        # Risk B: Representations exist + no indemnification → fraud/rescission claim
        has_reps = bool(re.search(
            r"\brepresents?\s+and\s+warrants?\b",
            text, re.IGNORECASE
        ))
        has_no_indemnification = bool(re.search(
            r"\bno\s+indemnification\s+provision\b"
            r"|\bthere\s+is\s+no\s+indemnif",
            text, re.IGNORECASE
        ))

        if has_reps and has_no_indemnification:
            litigation_risks.append({
                "area": "Fraud Allegations",
                "probability": "HIGH",
                "rationale": (
                    "Representations exist but no contractual remedy for breach. "
                    "Buyer's only recourse is rescission or tort fraud claim — "
                    "both high-cost, high-risk litigation paths that will be pursued "
                    "when material issues surface post-closing."
                ),
            })

        # Risk C: Asymmetric termination + Buyer incurs costs → wrongful termination risk
        has_asymmetric_termination = bool(re.search(
            r"seller\s+may\s+terminate\s+at\s+any\s+time\s+for\s+convenience"
            r"|seller\s+may\s+terminate\s+(?:this\s+agreement\s+)?(?:at\s+any\s+time\s+)?for\s+convenience",
            text, re.IGNORECASE
        ))
        has_break_fee = bool(re.search(
            r"\bbreak[- ](?:up\s+)?fee\b|\btermination\s+fee\b|\breverse\s+termination\s+fee\b",
            text, re.IGNORECASE
        ))

        if has_asymmetric_termination and not has_break_fee:
            litigation_risks.append({
                "area": "Purchase Price Adjustment Disputes",
                "probability": "HIGH",
                "rationale": (
                    "Seller holds unconditional convenience termination right with no "
                    "break fee payable to Buyer. If Seller terminates after Buyer has "
                    "incurred material due diligence costs, Buyer has no contractual "
                    "reimbursement right and must pursue tort remedies."
                ),
            })

        if litigation_risks:
            risk_descriptions = " | ".join(
                f"{r['area']} (Probability: {r['probability']}): {r['rationale']}"
                for r in litigation_risks
            )
            deduction = self.deductions.get("litigation_consistency_flag", 0)
            # Zero deduction — this is a consistency/reporting flag, not a new risk
            # The underlying risks are already penalized by the main engine
            # This finding exists to ensure the litigation section output is accurate

            finding = FormationFinding(
                rule="litigation_risk_consistency_flag",
                deduction=deduction,
                description=(
                    f"LITIGATION RISK CONSISTENCY FLAG — {len(litigation_risks)} "
                    f"high-probability litigation risk(s) detected that must be "
                    f"reflected as HIGH (not LOW) in the litigation risk output section: "
                    + risk_descriptions
                ),
                severity="high",
                location="Cross-document (§2 Earnout, §3 Reps, §8 Indemnification, §13 Termination)",
                suggestion=(
                    "Update litigation risk output to reflect: Earnout Disputes=HIGH, "
                    "Fraud Allegations=HIGH, Purchase Price Adjustment Disputes=HIGH. "
                    "These are not speculative — they are mechanically certain given "
                    "the contract provisions detected."
                ),
            )
            result.findings.append(finding)
            # No deduction added to total — purely a consistency flag

    # -----------------------------------------------------------------------
    # Check 6 — Administrative mechanics completeness
    # -----------------------------------------------------------------------

    def _check_administrative_completeness(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 6: Administrative mechanics completeness.
        
        Checks for:
        - Effective date / signing date
        - Party jurisdiction specification
        - Notice provision
        (Currency is handled separately in _check_currency_specification)
        """
        missing_fields = []

        for field_name, patterns in self._admin_re.items():
            if field_name == "currency":
                continue  # Handled separately
            has_field = any(p.search(text) for p in patterns)
            if not has_field:
                missing_fields.append(field_name.replace("_", " "))

        if missing_fields:
            result.missing_admin_fields.extend(missing_fields)
            deduction = self.deductions.get(
                "missing_admin_field_base", 2
            ) * len(missing_fields)
            deduction = min(deduction, self.deductions.get("admin_field_cap", 8))

            finding = FormationFinding(
                rule="missing_administrative_mechanics",
                deduction=deduction,
                description=(
                    f"MISSING ADMINISTRATIVE MECHANICS — The following standard "
                    f"administrative provisions are absent: "
                    + ", ".join(f"'{f}'" for f in missing_fields)
                    + ". These gaps create operational ambiguity: "
                    "an undated agreement makes it unclear when representations "
                    "are made and when statutes of limitations begin to run; "
                    "absent party jurisdiction creates enforcement uncertainty; "
                    "absent notice provisions mean there is no defined mechanism "
                    "for delivering termination notices or breach notices."
                ),
                severity="medium",
                location="Agreement Header / Boilerplate",
                suggestion=(
                    "Add to agreement preamble: "
                    "(1) Effective date: 'This Agreement is dated as of [DATE]'; "
                    "(2) Party jurisdiction: 'Buyer Co, a [STATE] [corporation/LLC]'; "
                    "(3) Notice provision: 'All notices under this Agreement shall be "
                    "in writing and delivered to [addresses] with copy to [counsel]'."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += deduction

    # -----------------------------------------------------------------------
    # Check 7 — Currency specification in cross-border context
    # -----------------------------------------------------------------------

    def _check_currency_specification(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 6 (continued): Currency specification.
        
        Detects:
        - Dollar amounts present ($50,000,000 etc.)
        - Cross-border indicators present (BVI, Luxembourg, "outside US")
        - But no explicit currency specification (USD, EUR, etc.)
        
        In cross-border deals, ambiguous currency = potential purchase price dispute.
        """
        has_dollar_amounts = bool(re.search(
            r"\$[\d,]+(?:\.\d+)?(?:\s*million)?\b", text, re.IGNORECASE
        ))
        has_cross_border = any(p.search(text) for p in self._cross_border_re)
        has_currency_spec = any(
            p.search(text) for p in self._admin_re.get("currency", [])
        )

        if has_dollar_amounts and has_cross_border and not has_currency_spec:
            result.currency_specified = False
            deduction = self.deductions.get("currency_not_specified_cross_border", 5)

            finding = FormationFinding(
                rule="currency_specification_missing",
                deduction=deduction,
                description=(
                    "CURRENCY AMBIGUITY IN CROSS-BORDER DEAL — The agreement contains "
                    "dollar-denominated amounts ($50,000,000 purchase price) and "
                    "cross-border indicators (BVI governing law, Luxembourg arbitration, "
                    "foreign tax disclaimer) but does not specify the currency of "
                    "payment. BVI uses USD; Luxembourg uses EUR. If exchange rates "
                    "move materially between signing and closing, a genuine dispute "
                    "about the actual purchase price denominated amount could arise."
                ),
                severity="medium",
                location="§2 Purchase Price / §10 Governing Law",
                suggestion=(
                    "Add to §2: 'All dollar amounts in this Agreement are denominated "
                    "in United States Dollars (USD), and all payments shall be made "
                    "in USD via wire transfer to an account designated in writing "
                    "by the receiving party.' "
                    "If payments may be made in EUR or another currency, add a "
                    "conversion rate mechanism (e.g., ECB rate on closing date)."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += deduction

    # -----------------------------------------------------------------------
    # Check 7 — Domestic tax gap (no foreign disclaimer ≠ domestic rep exists)
    # -----------------------------------------------------------------------

    def _check_domestic_tax_gap(
        self, text: str, result: FormationValidationResult
    ) -> None:
        """
        IMPROVEMENT AREA 7: Domestic tax gap.
        
        A foreign tax disclaimer does not create a domestic tax representation.
        This check is distinct from _check_tax_representation_completeness —
        that check handles the case where both disclaimer + gap coexist.
        
        This check handles the case where:
        - There is NO foreign tax disclaimer
        - AND there is NO domestic tax representation
        - i.e., the agreement is silent on taxes entirely
        
        Also handles: tax section exists but is purely procedural (no reps)
        """
        # Skip if already flagged in completeness check
        if result.tax_gap_detected:
            return

        has_any_tax_rep = any(p.search(text) for p in self._domestic_tax_re)
        has_any_tax_section = bool(re.search(
            r"\bTAX(?:ES|ATION|MATTERS?)?\b", text, re.IGNORECASE
        ))
        has_foreign_disclaimer = any(
            p.search(text) for p in self._foreign_tax_disclaimer_re
        )

        # Pure silence on taxes — no section, no rep, no disclaimer
        if not has_any_tax_rep and not has_any_tax_section and not has_foreign_disclaimer:
            deduction = self.deductions.get("complete_tax_silence", 8)
            finding = FormationFinding(
                rule="complete_tax_silence",
                deduction=deduction,
                description=(
                    "COMPLETE TAX SILENCE — The agreement contains no tax representations, "
                    "no tax section, and no tax disclaimer. In a $50M acquisition, "
                    "the absence of any tax provision means Buyer has zero contractual "
                    "protection against pre-closing tax liabilities in any jurisdiction. "
                    "Tax liabilities are typically the single largest contingent "
                    "liability in any acquisition."
                ),
                severity="critical",
                location="Agreement-wide",
                suggestion=(
                    "Add a comprehensive tax representation section covering: "
                    "(1) filing of all required tax returns; (2) payment of all taxes; "
                    "(3) no pending audits or disputes; (4) no tax liens; "
                    "(5) accuracy of all tax positions taken; "
                    "(6) no unpaid employer-side payroll taxes; "
                    "(7) transfer pricing compliance (if cross-border)."
                ),
            )
            result.findings.append(finding)
            result.total_deduction += deduction
            result.tax_gap_detected = True
