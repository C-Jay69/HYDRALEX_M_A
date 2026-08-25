# contract_qa.py
"""
Hydraforge contract QA / pre-flight guardrails.

Deterministic, LLM-free checks that catch the mechanical bugs the LLM pipeline
is prone to (per the analyzer improvement brief):

  * annotation / answer-key contamination in ingested text
  * schedule/exhibit reference truncation ("Schedule 1" instead of "Schedule 1.1(a)")
  * false "defined term never used" findings
  * governing-law misidentification (e.g. applying Delaware when it doesn't govern)
  * indemnity cap/basket scope over-extension
  * fraud-cap vs. exclusive-remedy vs. anti-reliance inconsistencies
  * materiality-scrape mislabeling
  * unsupported regulatory / Day-1 illegality overstatements

These run BEFORE the analyzer sees the text (annotation stripping) and AFTER a
draft is produced (analysis_qa), and surface as findings the critic/reconciler
can consume.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional


# ── Annotation / answer-key contamination ──────────────────────────────────

CONTAMINATION_PATTERNS = [
    r"🚩",
    r"🔑\s*ANSWER KEY",
    r"ANSWER KEY",
    r"Red Flag Contract",
    r"Clean Contract",
    r"Potential Cost/Risk",
    r"changed from",
    r"clean version",
    r"new vs\.?",
]


def detect_and_strip_annotations(raw_text: str) -> Dict[str, object]:
    """Strip obvious non-contractual annotations while preserving contractual
    placeholders (e.g. '[Identical to Clean Contract 2]')."""
    text = raw_text
    flags: List[str] = []

    for pat in CONTAMINATION_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            flags.append(f"Possible non-contractual annotation detected: {pat}")

    # Remove parser page headers.
    text = re.sub(r"<PARSED TEXT FOR PAGE:\s*\d+\s*/\s*\d+>\s*", "", text, flags=re.IGNORECASE)

    # Cut off an answer-key section entirely if present.
    answer_key_removed = False
    ak_match = re.search(r"(🔑\s*)?ANSWER KEY\s*[—\-:].*", text, flags=re.IGNORECASE | re.DOTALL)
    if ak_match:
        text = text[: ak_match.start()]
        answer_key_removed = True

    # Drop commentary lines (red-flag bullets, "Multiple changes", etc.).
    clean_lines: List[str] = []
    removed = 0
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("🚩"):
            removed += 1
            continue
        if re.match(
            r"^(Multiple changes|Added|Changed|Same access|Geographic scope|Termination fee present)",
            stripped,
            re.I,
        ):
            removed += 1
            continue
        clean_lines.append(line)

    clean_text = "\n".join(clean_lines)
    clean_text = re.sub(r"[ \t]+", " ", clean_text)
    clean_text = re.sub(r"\n{3,}", "\n\n", clean_text).strip()

    return {
        "clean_text": clean_text,
        "contamination_flags": flags,
        "removed_lines_count": removed,
        "answer_key_removed": answer_key_removed,
    }


# ── Reference / placeholder audit ──────────────────────────────────────────

SCHEDULE_PATTERN = re.compile(
    r"\bSchedule\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))?)"
)
EXHIBIT_PATTERN = re.compile(r"\bExhibit\s+([A-Z](?:\.\d+)?)")
SECTION_PATTERN = re.compile(
    r"\b(?:Section|§)\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))?)"
)


def extract_references(
    contract_text: str, provided_schedule_names: Optional[List[str]] = None
) -> Dict[str, object]:
    """Extract schedule/exhibit/section references WITHOUT truncating
    'Schedule 1.1(a)' into 'Schedule 1'."""
    provided_schedule_names = provided_schedule_names or []

    schedule_refs = sorted(set(SCHEDULE_PATTERN.findall(contract_text)))
    exhibit_refs = sorted(set(EXHIBIT_PATTERN.findall(contract_text)))
    section_refs = sorted(set(SECTION_PATTERN.findall(contract_text)))

    full_schedule_refs = [f"Schedule {x}" for x in schedule_refs]
    full_exhibit_refs = [f"Exhibit {x}" for x in exhibit_refs]
    full_section_refs = [f"Section {x}" for x in section_refs]

    # Contractual placeholders are NOT annotations — flag them for review.
    placeholders = re.findall(r"\[[^\]]{0,150}\]", contract_text)
    placeholders = [
        p
        for p in placeholders
        if re.search(r"Identical|TBD|To be provided|Clean Contract|insert|●|__+", p, flags=re.I)
    ]

    provided_normalized = {s.strip() for s in provided_schedule_names}
    possible_missing: List[str] = []
    if provided_schedule_names:
        for ref in full_schedule_refs:
            if ref not in provided_normalized:
                possible_missing.append(ref)

    return {
        "schedule_refs": full_schedule_refs,
        "exhibit_refs": full_exhibit_refs,
        "section_refs": full_section_refs,
        "placeholders": placeholders,
        "possible_missing_schedules": possible_missing,
    }


# ── Defined-term audit ─────────────────────────────────────────────────────

def extract_defined_terms(contract_text: str) -> Dict[str, object]:
    """Extract defined terms and count ALL usages (quoted + unquoted) so that
    heavily-used terms are not falsely flagged as 'never referenced'."""
    defined_terms: Dict[str, int] = {}

    # "Term" means ...
    for match in re.finditer(
        r'["“]([A-Z][A-Za-z0-9 \-/&]+?)["”]\s+means\b', contract_text
    ):
        term = match.group(1).strip()
        defined_terms[term] = len(re.findall(rf"\b{re.escape(term)}\b", contract_text))

    # the "Business" style
    for match in re.finditer(
        r'\b(?:the|a|an)\s+["“]([A-Z][A-Za-z0-9 \-/&]+?)["”]', contract_text
    ):
        term = match.group(1).strip()
        if len(term.split()) <= 6:
            defined_terms.setdefault(
                term, len(re.findall(rf"\b{re.escape(term)}\b", contract_text))
            )

    possibly_unused = [t for t, count in defined_terms.items() if count <= 1]
    confidence = "HIGH" if len(defined_terms) >= 5 else "LOW"

    return {
        "defined_terms": defined_terms,
        "possibly_unused_terms": possibly_unused,
        "parser_confidence": confidence,
    }


# ── Governing law ──────────────────────────────────────────────────────────

def extract_governing_law(contract_text: str) -> Dict[str, str]:
    result = {
        "general_governing_law": "UNKNOWN",
        "special_governing_law": "UNKNOWN",
        "raw_clause": "",
    }
    gov_match = re.search(r"(Governing Law\..{0,800})", contract_text, flags=re.I | re.S)
    if not gov_match:
        return result

    raw = re.split(r"\n\s*\d+\.\d+\s+", gov_match.group(1))[0]
    result["raw_clause"] = raw.strip()

    general = re.search(r"laws of the State of ([A-Za-z]+)", raw, flags=re.I)
    if general:
        result["general_governing_law"] = general.group(1)

    special = re.search(
        r"disputes relating to .*? shall be governed .*? laws of the State of ([A-Za-z]+)",
        raw,
        flags=re.I | re.S,
    )
    if special:
        result["special_governing_law"] = special.group(1)

    return result


# ── Indemnity precision warnings ───────────────────────────────────────────

def indemnity_precision_warnings(contract_text: str) -> List[str]:
    warnings: List[str] = []

    fraud_carveout = re.search(
        r"limitations?.{0,200}shall not apply.{0,200}fraud", contract_text, flags=re.I | re.S
    )
    exclusive_fraud = re.search(
        r"exclusive.{0,300}(fraud|intentional misrepresentation)", contract_text, flags=re.I | re.S
    )
    if fraud_carveout and exclusive_fraud:
        warnings.append(
            "Fraud appears carved out from cap/basket limitations but included in exclusive "
            "remedy. Do NOT state simply that fraud is capped; analyze exclusive-remedy/"
            "arbitration/anti-reliance separately."
        )

    cap_71a = re.search(
        r"Seller.?s liability under\s+7\.1\(a\).{0,300}(shall not exceed|cap|Deductible)",
        contract_text,
        flags=re.I | re.S,
    )
    if cap_71a:
        warnings.append(
            "Cap/basket language appears limited to Section 7.1(a). Do NOT apply it to "
            "7.1(b), 7.1(c), or 7.1(d) unless other text says so."
        )

    knowledge_71ab = re.search(
        r"clauses?\s*\(a\)\s*and\s*\(b\).{0,200}actual knowledge",
        contract_text,
        flags=re.I | re.S,
    )
    if knowledge_71ab:
        warnings.append(
            "Seller indemnity knowledge limitation appears to apply to both R&W breaches "
            "and covenant breaches."
        )

    return warnings


def materiality_scrape_warning(contract_text: str) -> Optional[str]:
    if re.search(
        r"in all material respects.{0,150}giving effect to all materiality and Knowledge qualifiers",
        contract_text,
        flags=re.I | re.S,
    ):
        return (
            "Closing condition preserves materiality and Knowledge qualifiers. Do NOT call "
            "this a materiality scrape — describe as no-scrape / double-materiality protection."
        )
    return None


# ── Regulatory overstatement warnings ──────────────────────────────────────

def regulatory_overstatement_warnings(contract_text: str, draft_report: str) -> List[str]:
    warnings: List[str] = []

    private_asset_deal = re.search(r"Asset Purchase Agreement", contract_text, re.I)
    sec_terms_in_report = re.search(
        r"S-4|DEF 14A|proxy|registration statement|SEC approval", draft_report, re.I
    )
    public_company_evidence = re.search(
        r"public company|Exchange Act|Securities Act|Form S-4|proxy statement|"
        r"shareholder vote|registered shares",
        contract_text,
        re.I,
    )
    if private_asset_deal and sec_terms_in_report and not public_company_evidence:
        warnings.append(
            "Report mentions federal securities filings/SEC process without contract evidence "
            "of a public-company securities transaction."
        )

    day1_illegal = re.search(r"cannot legally operate|Day-1 illegality|approval is required", draft_report, re.I)
    export_evidence = re.search(
        r"ITAR|EAR|DDTC|USML|ECCN|export license|defense article|classified", contract_text, re.I
    )
    if day1_illegal and not export_evidence:
        warnings.append(
            "Report states or implies Day-1 illegality/export approval requirement without "
            "direct ITAR/EAR evidence. Recast as a potential diligence issue unless supported."
        )

    return warnings


# ── Aggregate QA over a draft report ───────────────────────────────────────

def analysis_qa(contract_text: str, draft_report: str = "") -> List[str]:
    issues: List[str] = []

    gov = extract_governing_law(contract_text)
    if gov["general_governing_law"] != "Delaware" and re.search(
        r"\bDelaware\b|Akorn|Fresenius", draft_report, re.I
    ):
        issues.append(
            f"Report cites Delaware doctrine, but general governing law appears to be "
            f"{gov['general_governing_law']}. Label Delaware as non-governing market guidance."
        )

    if re.search(r"fraud .* capped|fraud .* subject to .* cap|fraud .* subject to .* basket", draft_report, re.I):
        if re.search(r"shall not apply.{0,200}fraud", contract_text, re.I | re.S):
            issues.append(
                "Report may incorrectly state fraud is capped/basketed despite a fraud "
                "carve-out from limitations."
            )

    mat_warning = materiality_scrape_warning(contract_text)
    if mat_warning and re.search(r"materiality scrape", draft_report, re.I):
        issues.append(mat_warning)

    issues.extend(indemnity_precision_warnings(contract_text))
    issues.extend(regulatory_overstatement_warnings(contract_text, draft_report))

    if re.search(r"Schedule 1\b", draft_report) and re.search(r"Schedule 1\.1", contract_text):
        issues.append(
            "Possible schedule truncation: report says 'Schedule 1' but contract uses "
            "'Schedule 1.1(a)'/1.2/1.3."
        )
    if re.search(r"Schedule 3\b", draft_report) and re.search(r"Schedule 3\.\d", contract_text):
        issues.append(
            "Possible schedule truncation: report says 'Schedule 3' but contract uses "
            "detailed Schedule 3.x references."
        )

    return issues


# ── Convenience entrypoint used by the pipeline ────────────────────────────

def run_contract_qa(raw_text: str, draft_report: str = "") -> List[Dict[str, object]]:
    """Run all deterministic QA checks. Returns a list of finding dicts suitable
    for the critic/reconciler layer."""
    findings: List[Dict[str, object]] = []

    prep = detect_and_strip_annotations(raw_text)
    clean = prep["clean_text"]  # type: ignore[assignment]

    if prep["contamination_flags"]:  # type: ignore[arg-type]
        findings.append({
            "type": "annotation_contamination",
            "severity": "medium",
            "issue": "Input contained non-contractual annotations",
            "flags": prep["contamination_flags"],
            "answer_key_removed": prep["answer_key_removed"],
            "fix": "Analyze only the cleaned contractual text; exclude commentary/answer keys.",
        })

    refs = extract_references(clean)
    if refs["possible_missing_schedules"]:  # type: ignore[arg-type]
        findings.append({
            "type": "missing_schedule",
            "severity": "high",
            "issue": "Referenced schedules not provided",
            "references": refs["possible_missing_schedules"],
            "fix": "Confirm referenced schedules are attached before relying on the report.",
        })
    if refs["placeholders"]:  # type: ignore[arg-type]
        findings.append({
            "type": "placeholder_drafting",
            "severity": "low",
            "issue": "Contractual placeholders detected (incomplete drafting)",
            "placeholders": refs["placeholders"],
            "fix": "Treat placeholder text as a drafting defect, not a normal cross-reference.",
        })

    terms = extract_defined_terms(clean)
    unused = terms["possibly_unused_terms"]  # type: ignore[assignment]
    # Sanity gate: many "unused" terms in a substantive doc indicates a parser bug.
    if len(unused) > 3 and len(clean) > 5000:
        findings.append({
            "type": "dead_definition_sanity",
            "severity": "low",
            "issue": "Multiple 'unused' defined terms flagged — likely parser bug, suppressed",
            "terms": unused,
            "fix": "Route to QA review; do not surface as user-facing drafting defects.",
        })
    elif unused:
        findings.append({
            "type": "possibly_unused_term",
            "severity": "low",
            "issue": "Defined term(s) appear only at their definition site",
            "terms": unused,
            "fix": "Verify the term is actually used elsewhere in the agreement.",
        })

    gov = extract_governing_law(clean)
    findings.append({
        "type": "governing_law",
        "severity": "info",
        "general": gov["general_governing_law"],
        "special": gov["special_governing_law"],
        "fix": "Verify enforceability analysis uses the correct governing law.",
    })

    for w in indemnity_precision_warnings(clean):
        findings.append({"type": "indemnity_precision", "severity": "medium", "issue": w})
    mat = materiality_scrape_warning(clean)
    if mat:
        findings.append({"type": "materiality_scrape", "severity": "medium", "issue": mat})

    if draft_report:
        for w in analysis_qa(clean, draft_report):
            findings.append({"type": "draft_qa", "severity": "medium", "issue": w})

    return findings


if __name__ == "__main__":
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "contract.txt"
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    result = run_contract_qa(raw)
    for f in result:
        print(f"[{f['severity']}] {f['type']}: {f['issue']}")
