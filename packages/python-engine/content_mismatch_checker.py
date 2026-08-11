"""
content_mismatch_checker.py
---------------------------
Reusable section parser and content mismatch checker.
Used by FormationValidator but also callable independently
if you want to run just the mismatch check.

Usage:
    checker = ContentMismatchChecker(section_content_map)
    mismatches = checker.check(raw_text)
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class SectionMismatch:
    section_number: str
    header: str
    content_preview: str      # First 200 chars of content
    mismatch_type: str        # "absent" | "negated" | "contradictory"
    expected_keywords: List[str]
    found_negation: Optional[str]


class ContentMismatchChecker:
    """
    Parses contract sections and checks header vs content consistency.
    
    section_content_map: dict mapping header keywords to expected content keywords
    Example (loaded from YAML):
        CONFIDENTIALITY:
          - confidential
          - non-disclosure
          - proprietary information
          - disclosure
        INDEMNIFICATION:
          - indemnif
          - hold harmless
          - defend
          - losses
    """

    # Negation phrases that indicate a section eliminates rather than provides
    NEGATION_TEMPLATES = [
        r"there\s+is\s+no\s+{kw}",
        r"no\s+{kw}\s+(?:provision|obligation|right|clause)",
        r"{kw}\s+(?:is\s+)?(?:hereby\s+)?(?:waived|eliminated|disclaimed|excluded)",
        r"buyer\s+(?:hereby\s+)?waives?\s+(?:any\s+)?(?:right\s+to\s+)?{kw}",
        r"(?:this\s+agreement\s+)?contains?\s+no\s+{kw}",
        r"expressly\s+excludes?\s+(?:any\s+)?{kw}",
    ]

    def __init__(self, section_content_map: Dict[str, List[str]]):
        self.section_content_map = {
            k.upper(): v for k, v in section_content_map.items()
        }
        self._build_negation_patterns()

    def _build_negation_patterns(self) -> None:
        """Pre-compile negation patterns for each keyword."""
        self._negation_cache: Dict[str, List[re.Pattern]] = {}
        for header, keywords in self.section_content_map.items():
            patterns = []
            for kw in keywords:
                for template in self.NEGATION_TEMPLATES:
                    pattern_str = template.replace("{kw}", re.escape(kw))
                    patterns.append(re.compile(pattern_str, re.IGNORECASE | re.DOTALL))
            self._negation_cache[header] = patterns

    def parse_sections(self, text: str) -> List[Tuple[str, str, str]]:
        """
        Parse contract into (section_number, header, content) tuples.
        
        Handles formats:
        - "1. OVERVIEW\n content"
        - "Section 1. Overview\n content"  
        - "ARTICLE I\n content"
        """
        patterns = [
            # Standard numbered: "1. HEADER TITLE"
            re.compile(
                r"(?:^|\n)\s*(\d{1,2})\.\s+([A-Z][A-Z\s&/,\-]+?)(?:\n|$)(.*?)"
                r"(?=\n\s*\d{1,2}\.\s+[A-Z]|\Z)",
                re.DOTALL | re.MULTILINE,
            ),
            # "Section N. Header"
            re.compile(
                r"(?:^|\n)\s*[Ss]ection\s+(\d{1,2})\.\s+([A-Za-z][A-Za-z\s&/,\-]+?)(?:\n|$)(.*?)"
                r"(?=\n\s*[Ss]ection\s+\d{1,2}\.|\Z)",
                re.DOTALL | re.MULTILINE,
            ),
        ]

        sections = []
        for pattern in patterns:
            found = pattern.findall(text)
            if found:
                sections = found
                break

        return sections

    def check(self, text: str) -> List[SectionMismatch]:
        """
        Check all sections for header/content mismatches.
        Returns list of SectionMismatch objects.
        """
        sections = self.parse_sections(text)
        mismatches = []

        for section_num, header, content in sections:
            header_upper = header.strip().upper()
            content_lower = content.lower().strip()

            if not content_lower:
                continue

            # Find matching map entry (partial match)
            matched_header = None
            matched_keywords = None
            for map_header, keywords in self.section_content_map.items():
                if map_header in header_upper or header_upper in map_header:
                    matched_header = map_header
                    matched_keywords = keywords
                    break

            if not matched_keywords:
                continue

            # Check keyword presence
            keywords_present = [
                kw for kw in matched_keywords
                if kw.lower() in content_lower
            ]
            keywords_absent = [
                kw for kw in matched_keywords
                if kw.lower() not in content_lower
            ]

            # Check negation
            negation_found = None
            if matched_header in self._negation_cache:
                for pattern in self._negation_cache[matched_header]:
                    match = pattern.search(content_lower)
                    if match:
                        negation_found = match.group()
                        break

            content_preview = content[:200].replace("\n", " ").strip()

            # Classify mismatch type
            if not keywords_present:
                mismatches.append(SectionMismatch(
                    section_number=section_num,
                    header=header_upper,
                    content_preview=content_preview,
                    mismatch_type="absent",
                    expected_keywords=matched_keywords,
                    found_negation=None,
                ))
            elif negation_found:
                mismatches.append(SectionMismatch(
                    section_number=section_num,
                    header=header_upper,
                    content_preview=content_preview,
                    mismatch_type="negated",
                    expected_keywords=keywords_present,
                    found_negation=negation_found,
                ))

        return mismatches

    def get_summary(self, mismatches: List[SectionMismatch]) -> str:
        """Human-readable summary for logging/debugging."""
        if not mismatches:
            return "No section header/content mismatches detected."
        lines = [f"{len(mismatches)} mismatch(es) detected:"]
        for m in mismatches:
            lines.append(
                f"  §{m.section_number} '{m.header}': {m.mismatch_type}"
                + (f" (negation: '{m.found_negation[:50]}')" if m.found_negation else "")
            )
        return "\n".join(lines)