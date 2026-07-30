# cross_document_consistency.py
"""
Cross-Document Consistency Engine

Compares multiple M&A transaction documents for consistency issues:
- Defined term mismatches across documents
- Broken cross-references
- Duplicate section numbering
- Date inconsistencies
- Dollar amount conflicts
- Share count discrepancies
- Signatory mismatches
- Missing schedules/exhibits
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set


class ConsistencyIssueType(Enum):
    DEFINED_TERM_MISMATCH = "defined_term_mismatch"
    CROSS_REFERENCE_BROKEN = "cross_reference_broken"
    SECTION_NUMBERING_DUPLICATE = "section_numbering_duplicate"
    DATE_INCONSISTENCY = "date_inconsistency"
    DOLLAR_AMOUNT_CONFLICT = "dollar_amount_conflict"
    SHARE_COUNT_DISCREPANCY = "share_count_discrepancy"
    SIGNATORY_MISMATCH = "signatory_mismatch"
    DISCLOSURE_SCHEDULE_MISSING = "disclosure_schedule_missing"
    FINANCIAL_STATEMENT_MISMATCH = "financial_statement_mismatch"
    ANNEX_CONFLICT = "annex_conflict"
    AMENDMENT_CONFLICT = "amendment_conflict"
    UNDEFINED_TERM_USAGE = "undefined_term_usage"
    ORPHAN_REFERENCE = "orphan_reference"
    CIRCULAR_DEFINITION = "circular_definition"


class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"


@dataclass
class ConsistencyFinding:
    issue_type: ConsistencyIssueType
    severity: Severity
    document_a: str
    document_b: Optional[str]
    description: str
    evidence_a: str = ""
    evidence_b: str = ""
    suggested_fix: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.issue_type.value,
            "severity": self.severity.value,
            "document_a": self.document_a,
            "document_b": self.document_b,
            "description": self.description,
            "evidence_a": self.evidence_a,
            "evidence_b": self.evidence_b,
            "suggested_fix": self.suggested_fix,
        }


class DocumentMetadata:
    """Extracted metadata from a single document for comparison"""

    def __init__(self, doc_name: str, text: str):
        self.doc_name = doc_name
        self.text = text
        self.defined_terms: Dict[str, str] = {}
        self.section_numbers: List[str] = []
        self.dates: List[str] = []
        self.dollar_amounts: List[str] = []
        self.share_counts: List[str] = []
        self.signatories: List[str] = []
        self.schedule_refs: List[str] = []
        self.party_names: List[str] = []
        self._extract_all()

    def _extract_all(self) -> None:
        self._extract_defined_terms()
        self._extract_section_numbers()
        self._extract_dates()
        self._extract_dollar_amounts()
        self._extract_share_counts()
        self._extract_signatories()
        self._extract_schedule_refs()
        self._extract_party_names()

    def _extract_defined_terms(self) -> None:
        """Extract defined terms with their definitions"""
        # Pattern: "Term" means ... or "Term" shall mean ...
        patterns = [
            r'"([^"]{3,60})"\s+(?:means|shall mean|is defined as|refers to)\s+([^.]{10,300})',
            r"'([^']{3,60})'\s+(?:means|shall mean|is defined as|refers to)\s+([^.]{10,300})",
            r'\b([A-Z][a-zA-Z\s]{2,40})\s*\(\s*"([^"]{3,60})"\s*\)\s+(?:means|shall mean|is defined as|refers to)\s+([^.]{10,300})',
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, self.text, re.IGNORECASE | re.DOTALL):
                term = match.group(1).strip().title()
                definition = match.group(2).strip() if match.lastindex >= 2 else match.group(0)[:300]
                if term not in self.defined_terms:
                    self.defined_terms[term] = definition[:300]

    def _extract_section_numbers(self) -> None:
        """Extract all section/article numbers"""
        pattern = r'(?:^|\n)\s*(?:Section|Article)\s+(\d+(?:\.\d+)*(?:[a-z])?)'
        self.section_numbers = re.findall(pattern, self.text, re.MULTILINE | re.IGNORECASE)

    def _extract_dates(self) -> None:
        """Extract all dates"""
        patterns = [
            r'\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b',
            r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b',
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, self.text, re.IGNORECASE):
                date_str = match.group(1) if match.lastindex >= 1 else match.group(0)
                self.dates.append(date_str.strip())

    def _extract_dollar_amounts(self) -> None:
        """Extract dollar amounts"""
        pattern = r'(?:\$|USD|US\$)\s*[\d,]+\.?\d*\s*(?:million|billion|thousand|MM|MM|M|B)?\b'
        self.dollar_amounts = re.findall(pattern, self.text, re.IGNORECASE)

    def _extract_share_counts(self) -> None:
        """Extract share count references"""
        pattern = r'[\d,]+\s*(?:shares?|stocks?|units|membership\s+interests|equity\s+interests|common\s+stock|preferred\s+stock)'
        self.share_counts = re.findall(pattern, self.text, re.IGNORECASE)

    def _extract_signatories(self) -> None:
        """Extract signatory references"""
        patterns = [
            r'(?:signed|executed|attorney|representative|authorized\s+signatory)\s+(?:by|of)?\s+(?:the\s+)?([A-Z][\w\s]{2,80})',
            r'(?:Buyer|Seller|Target|Purchaser|Acquirer|Vendor|Grantor|Grantee)\s*:\s*([A-Z][\w\s]{2,80})',
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, self.text, re.MULTILINE | re.IGNORECASE):
                sig = match.group(1).strip() if match.lastindex >= 1 else match.group(0).strip()
                if len(sig) > 3 and len(sig) < 100:
                    self.signatories.append(sig)

    def _extract_schedule_refs(self) -> None:
        """Extract schedule and exhibit references"""
        pattern = r'(?:Schedule|Exhibit|Annex|Appendix|Schedule\s+|Exhibit\s+)\s*([A-Z]?\d+[a-z]?)'
        self.schedule_refs = list(set(re.findall(pattern, self.text, re.IGNORECASE)))

    def _extract_party_names(self) -> None:
        """Extract party names"""
        pattern = r'(?:the\s+)?(?:Buyer|Seller|Target|Purchaser|Acquirer|Vendor|Grantor|Grantee|Lender|Borrower|Agent|Guarantor|Subsidiary|Affiliate)[\w\s]*'
        self.party_names = list(set(re.findall(pattern, self.text, re.IGNORECASE)))


class CrossDocumentConsistencyEngine:
    """Compares multiple documents for consistency issues"""

    def __init__(self):
        self.documents: Dict[str, DocumentMetadata] = {}
        self.findings: List[ConsistencyFinding] = []

    def add_document(self, doc_name: str, text: str) -> None:
        """Register a document for consistency analysis"""
        self.documents[doc_name] = DocumentMetadata(doc_name, text)

    def run_all_checks(self) -> List[ConsistencyFinding]:
        """Run all consistency checks"""
        self.findings = []
        if len(self.documents) < 2:
            return self.findings

        self.findings.extend(self._check_defined_term_consistency())
        self.findings.extend(self._check_cross_references())
        self.findings.extend(self._check_section_numbering())
        self.findings.extend(self._check_date_consistency())
        self.findings.extend(self._check_dollar_amount_consistency())
        self.findings.extend(self._check_share_count_consistency())
        self.findings.extend(self._check_signatory_consistency())
        self.findings.extend(self._check_schedule_references())

        return self.findings

    def _check_defined_term_consistency(self) -> List[ConsistencyFinding]:
        """Check that defined terms are consistent across documents"""
        findings = []
        all_terms: Dict[str, Dict[str, str]] = {}

        # Collect all terms from all documents
        for doc_name, meta in self.documents.items():
            for term, definition in meta.defined_terms.items():
                if term not in all_terms:
                    all_terms[term] = {}
                all_terms[term][doc_name] = definition

        # Find terms defined differently across docs
        for term, definitions in all_terms.items():
            if len(definitions) > 1:
                # Normalize and compare
                normalized = {}
                for doc, defn in definitions.items():
                    norm = re.sub(r'\s+', ' ', defn.lower().strip())
                    normalized[norm] = normalized.get(norm, []) + [doc]

                if len(normalized) > 1:
                    doc_list = list(definitions.keys())
                    findings.append(ConsistencyFinding(
                        issue_type=ConsistencyIssueType.DEFINED_TERM_MISMATCH,
                        severity=Severity.HIGH,
                        document_a=doc_list[0],
                        document_b=doc_list[1] if len(doc_list) > 1 else None,
                        description=f"Term '{term}' is defined differently across documents: {', '.join(doc_list)}",
                        evidence_a="\n".join([f"{doc}: {defn[:100]}" for doc, defn in definitions.items()]),
                        suggested_fix=f"Align the definition of '{term}' across all documents or use a Master Definitions section."
                    ))
        return findings

    def _check_cross_references(self) -> List[ConsistencyFinding]:
        """Check that cross-references to schedules/exhibits are valid"""
        findings = []

        # Collect all known schedules/exhibits
        all_refs: Set[str] = set()
        for meta in self.documents.values():
            for ref in meta.schedule_refs:
                all_refs.add(ref.lower().strip())

        # Check each document for references to potentially missing schedules
        for doc_name, meta in self.documents.items():
            # Look for "referenced in Schedule X" or "pursuant to Exhibit Y"
            ref_pattern = r'(?:referenced\s+in|see\s+(?:Schedule|Exhibit|Annex|Appendix)\s+|pursuant\s+to\s+(?:Schedule|Exhibit|Annex|Appendix)\s+)(\w[\w\s\d]+)'
            for match in re.finditer(ref_pattern, meta.text, re.IGNORECASE):
                ref = match.group(1).strip().lower()
                if ref not in all_refs and len(ref) > 2:
                    findings.append(ConsistencyFinding(
                        issue_type=ConsistencyIssueType.CROSS_REFERENCE_BROKEN,
                        severity=Severity.HIGH,
                        document_a=doc_name,
                        document_b=None,
                        description=f"Cross-reference to '{match.group(0)}' may reference a missing or differently-named schedule/exhibit",
                        evidence_a=match.group(0),
                        suggested_fix=f"Verify that the referenced schedule/exhibit exists and is correctly named."
                    ))
        return findings

    def _check_section_numbering(self) -> List[ConsistencyFinding]:
        """Check for duplicate section numbers within each document"""
        findings = []
        for doc_name, meta in self.documents.items():
            seen: Dict[str, int] = {}
            for s in meta.section_numbers:
                seen[s] = seen.get(s, 0) + 1

            for section, count in seen.items():
                if count > 1:
                    findings.append(ConsistencyFinding(
                        issue_type=ConsistencyIssueType.SECTION_NUMBERING_DUPLICATE,
                        severity=Severity.MODERATE,
                        document_a=doc_name,
                        document_b=None,
                        description=f"Duplicate section '{section}' found {count} times in {doc_name}",
                        evidence_a=f"'{section}' appears {count} times",
                        suggested_fix="Resolve duplicate section numbering to avoid ambiguity in cross-references."
                    ))
        return findings

    def _check_date_consistency(self) -> List[ConsistencyFinding]:
        """Check dates for inconsistencies across documents"""
        findings = []

        # Build map of date -> documents where it appears
        date_map: Dict[str, List[str]] = {}
        for doc_name, meta in self.documents.items():
            for date_str in meta.dates:
                clean = self._normalize_date(date_str)
                if clean:
                    date_map.setdefault(clean, []).append(doc_name)

        # Find dates that should be the same but differ
        # This is a heuristic - we flag when the same date field type appears with different values
        for doc_name, meta in self.documents.items():
            for date_str in meta.dates:
                clean = self._normalize_date(date_str)
                if clean and len(date_map.get(clean, [])) == 1:
                    # Date only appears in one doc - check if other docs have different dates
                    # for the same type of date (e.g., "effective date", "closing date")
                    context = self._get_date_context(meta.text, date_str)
                    for other_doc, other_meta in self.documents.items():
                        if other_doc == doc_name:
                            continue
                        other_context = self._get_date_context(other_meta.text, date_str)
                        if context and other_context and context == other_context:
                            # Same context, check for different dates
                            for other_date in other_meta.dates:
                                other_clean = self._normalize_date(other_date)
                                if other_clean != clean:
                                    findings.append(ConsistencyFinding(
                                        issue_type=ConsistencyIssueType.DATE_INCONSISTENCY,
                                        severity=Severity.HIGH,
                                        document_a=doc_name,
                                        document_b=other_doc,
                                        description=f"Date '{date_str}' in {doc_name} conflicts with '{other_date}' in {other_doc} (both labeled as {context})",
                                        evidence_a=date_str,
                                        evidence_b=other_date,
                                        suggested_fix=f"Resolve the date discrepancy for '{context}' - ensure consistent dates across all documents."
                                    ))
        return findings

    def _normalize_date(self, date_str: str) -> Optional[str]:
        """Normalize date string for comparison"""
        try:
            # Try common formats
            for fmt in ['%m/%d/%Y', '%m-%d-%Y', '%B %d, %Y', '%d %B %Y']:
                try:
                    import datetime
                    return datetime.datetime.strptime(date_str.strip(), fmt).strftime('%Y-%m-%d')
                except ValueError:
                    continue
        except Exception:
            pass
        return date_str.strip().lower()

    def _get_date_context(self, text: str, date_str: str) -> Optional[str]:
        """Get the context label for a date (e.g., 'effective date', 'closing date')"""
        idx = text.find(date_str)
        if idx == -1:
            return None

        # Look before the date for context
        start = max(0, idx - 100)
        context_text = text[start:idx].lower()

        context_patterns = {
            'effective date': r'\b(effective\s+date|date\s+of\s+effectiveness)\b',
            'closing date': r'\b(closing\s+date|date\s+of\s+closing)\b',
            'signing date': r'\b(signing\s+date|date\s+of\s+signing|execution\s+date)\b',
            'outside date': r'\b(outside\s+date|drop-dead\s+date)\b',
            'termination date': r'\b(termination\s+date)\b',
        }

        for label, pattern in context_patterns.items():
            if re.search(pattern, context_text):
                return label
        return None

    def _check_dollar_amount_consistency(self) -> List[ConsistencyFinding]:
        """Check dollar amounts for conflicts"""
        findings = []

        # Normalize amounts for comparison
        amount_map: Dict[str, List[Tuple[str, str]]] = {}  # normalized -> [(doc, original)]

        for doc_name, meta in self.documents.items():
            for amt in meta.dollar_amounts:
                norm = self._normalize_amount(amt)
                if norm:
                    amount_map.setdefault(norm, []).append((doc_name, amt))

        # Check for amounts that appear in multiple docs with same label but different context
        for norm_amt, occurrences in amount_map.items():
            if len(occurrences) > 1:
                docs = list(set(doc for doc, _ in occurrences))
                if len(docs) > 1:
                    findings.append(ConsistencyFinding(
                        issue_type=ConsistencyIssueType.DOLLAR_AMOUNT_CONFLICT,
                        severity=Severity.CRITICAL,
                        document_a=docs[0],
                        document_b=docs[1] if len(docs) > 1 else None,
                        description=f"Dollar amount '{occurrences[0][1]}' appears in multiple documents: {', '.join(docs)}",
                        evidence_a="\n".join([f"{doc}: {amt}" for doc, amt in occurrences]),
                        suggested_fix="Verify whether both amounts represent the same value (may be different units - million vs thousand) or actual conflicts."
                    ))
        return findings

    def _normalize_amount(self, amt: str) -> Optional[str]:
        """Normalize dollar amount for comparison"""
        # Extract numeric value and unit
        match = re.search(r'[\d,]+\.?\d*', amt.replace(',', ''))
        if not match:
            return None
        num = float(match.group(0))
        unit = '1'
        if 'billion' in amt.lower() or 'b' in amt.lower():
            unit = 'billion'
        elif 'million' in amt.lower() or 'mm' in amt.lower() or 'm' in amt.lower():
            unit = 'million'
        elif 'thousand' in amt.lower() or 'k' in amt.lower():
            unit = 'thousand'
        return f"{num}_{unit}"

    def _check_share_count_consistency(self) -> List[ConsistencyFinding]:
        """Check share counts for discrepancies"""
        findings = []

        # Extract numeric share counts
        count_map: Dict[str, List[Tuple[str, str]]] = {}
        for doc_name, meta in self.documents.items():
            for count in meta.share_counts:
                match = re.search(r'[\d,]+', count.replace(',', ''))
                if match:
                    num = match.group(0)
                    count_map.setdefault(num, []).append((doc_name, count))

        for num, occurrences in count_map.items():
            if len(occurrences) > 1:
                docs = list(set(doc for doc, _ in occurrences))
                if len(docs) > 1:
                    findings.append(ConsistencyFinding(
                        issue_type=ConsistencyIssueType.SHARE_COUNT_DISCREPANCY,
                        severity=Severity.HIGH,
                        document_a=docs[0],
                        document_b=docs[1] if len(docs) > 1 else None,
                        description=f"Share count '{occurrences[0][1]}' appears in multiple documents: {', '.join(docs)}",
                        evidence_a="\n".join([f"{doc}: {cnt}" for doc, cnt in occurrences]),
                        suggested_fix="Verify share counts are consistent across all documents, especially for purchase price calculations."
                    ))
        return findings

    def _check_signatory_consistency(self) -> List[ConsistencyFinding]:
        """Check signatories for consistency"""
        findings = []

        # Build signatory map
        sig_map: Dict[str, List[str]] = {}
        for doc_name, meta in self.documents.items():
            for sig in meta.signatories:
                sig_map.setdefault(sig, []).append(doc_name)

        # Look for same signatory in multiple docs - this is actually expected
        # Flag when expected signatories are missing
        for doc_name, meta in self.documents.items():
            if not meta.signatories and len(self.documents) > 1:
                findings.append(ConsistencyFinding(
                    issue_type=ConsistencyIssueType.SIGNATORY_MISMATCH,
                    severity=Severity.MODERATE,
                    document_a=doc_name,
                    document_b=None,
                    description=f"No signatories found in {doc_name} while other documents have them",
                    suggested_fix="Verify all required signatories are included in each document."
                ))

        return findings

    def _check_schedule_references(self) -> List[ConsistencyFinding]:
        """Check that referenced schedules/exhibits exist"""
        findings = []

        # Collect all defined schedules
        all_schedules: Set[str] = set()
        for meta in self.documents.values():
            for ref in meta.schedule_refs:
                all_schedules.add(ref.lower().strip())

        # Check each document for references to schedules
        for doc_name, meta in self.documents.items():
            for ref in meta.schedule_refs:
                # Check if this schedule is referenced but not actually attached/defined
                context_pattern = rf'(?:referenced\s+in|see\s+)(?:Schedule|Exhibit|Annex|Appendix)\s+{re.escape(ref)}'
                if re.search(context_pattern, meta.text, re.IGNORECASE):
                    if ref.lower() not in all_schedules:
                        findings.append(ConsistencyFinding(
                            issue_type=ConsistencyIssueType.DISCLOSURE_SCHEDULE_MISSING,
                            severity=Severity.HIGH,
                            document_a=doc_name,
                            document_b=None,
                            description=f"Schedule/Exhibit '{ref}' referenced in {doc_name} but not provided",
                            suggested_fix=f"Provide the referenced Schedule/Exhibit {ref} or remove the cross-reference."
                        ))
        return findings

    def get_summary(self) -> Dict[str, Any]:
        """Get summary of findings"""
        by_severity = {}
        by_type = {}

        for f in self.findings:
            sev = f.severity.value
            by_severity[sev] = by_severity.get(sev, 0) + 1

            typ = f.issue_type.value
            by_type[typ] = by_type.get(typ, 0) + 1

        return {
            "total_findings": len(self.findings),
            "documents_analyzed": len(self.documents),
            "by_severity": by_severity,
            "by_type": by_type,
            "findings": [f.to_dict() for f in self.findings]
        }


def analyze_document_consistency(documents: Dict[str, str]) -> Dict[str, Any]:
    """
    Main entry point: analyze consistency across multiple documents.

    Args:
        documents: Dict of {document_name: text_content}

    Returns:
        Analysis results with findings and summary
    """
    engine = CrossDocumentConsistencyEngine()

    for doc_name, text in documents.items():
        engine.add_document(doc_name, text)

    engine.run_all_checks()
    return engine.get_summary()