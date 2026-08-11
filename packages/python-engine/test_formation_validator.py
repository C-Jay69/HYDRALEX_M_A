"""
test_formation_validator.py
---------------------------
Unit tests for FormationValidator.
Run with: pytest test_formation_validator.py -v
"""

import pytest
import yaml
from formation_validator import FormationValidator, FormationValidationResult


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def config():
    """Minimal config for testing — loads from YAML if available."""
    try:
        with open("merger_scoring_config.yaml") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        # Fallback minimal config for isolated testing
        return {
            "formation_validator": {
                "deductions": {
                    "weak_merger_language": 12,
                    "missing_merger_element": 4,
                    "merger_element_cap": 16,
                    "header_content_mismatch_absent": 6,
                    "header_content_mismatch_negated": 10,
                    "phantom_reference": 4,
                    "phantom_reference_cap": 12,
                    "no_domestic_tax_rep_with_foreign_disclaimer": 10,
                    "empty_tax_section": 7,
                    "litigation_consistency_flag": 0,
                    "missing_admin_field_base": 2,
                    "admin_field_cap": 8,
                    "currency_not_specified_cross_border": 5,
                    "complete_tax_silence": 8,
                },
                "section_content_map": {
                    "CONFIDENTIALITY": [
                        "confidential", "non-disclosure", "proprietary", "disclose"
                    ],
                    "INDEMNIFICATION": [
                        "indemnif", "hold harmless", "defend", "losses"
                    ],
                    "TAX MATTERS": ["tax", "taxes", "return", "filing"],
                    "ENTIRE AGREEMENT": [
                        "entire agreement", "integration", "supersede"
                    ],
                },
                "phantom_triggers": [
                    "except as noted",
                    "as set forth in schedule",
                    "see exhibit",
                ],
                "weak_merger_phrases": [
                    r"\bintend\s+this\s+to\s+be\s+a\s+merger\b",
                ],
                "strong_merger_phrases": [
                    r"\bshall\s+merge\s+with\s+and\s+into\b",
                    r"\bsurviving\s+entity\b",
                ],
                "merger_structural_elements": {
                    "surviving_entity": [r"\bsurviving\s+entity\b"],
                    "merger_statute": [r"\bdelaware\s+general\s+corporation\s+law\b"],
                    "effective_time": [r"\beffective\s+time\b"],
                    "merger_structure": [r"\bforward\s+merger\b"],
                },
                "admin_fields": {
                    "effective_date": [r"\bdated\s+as\s+of\b", r"\b\d{4}-\d{2}-\d{2}\b"],
                    "currency": [r"\busd\b", r"\bu\.s\.\s+dollars?\b"],
                    "party_jurisdiction": [r"\bdelaware\s+corporation\b"],
                    "notice_provision": [r"\bwritten\s+notice\b"],
                },
                "cross_border_indicators": [
                    r"\bbritish\s+virgin\s+islands\b",
                    r"\bluxembourg\b",
                ],
                "domestic_tax_rep_patterns": [
                    r"\btax\s+returns?\s+(?:have\s+been\s+)?filed\b",
                    r"\ball\s+taxes\s+(?:have\s+been\s+)?paid\b",
                ],
                "foreign_tax_disclaimer_patterns": [
                    r"\bno\s+representations?\s+regarding\s+taxes?\s+outside\b",
                    r"\bmakes?\s+no\s+(?:tax\s+)?representations?\s+.*?outside\b",
                ],
            }
        }


@pytest.fixture
def validator(config):
    return FormationValidator(config)


# ---------------------------------------------------------------------------
# Test: Actual sample contract
# ---------------------------------------------------------------------------

SAMPLE_CONTRACT = """
MERGER AGREEMENT 1 fr

This Agreement is made between "Buyer Co" and "Target Co".

1. OVERVIEW
Buyer shall acquire Target. The parties intend this to be a merger.

2. PURCHASE PRICE
The total purchase price shall be $50,000,000, payable as follows:
- $30,000,000 cash at closing
- $20,000,000 earnout based on performance metrics to be mutually agreed

3. REPRESENTATIONS AND WARRANTIES
Target represents and warrants that:
- To the best of its knowledge, there are no material liabilities
- Its financial statements are fairly presented
- It is in substantial compliance with all applicable laws
- There are no pending lawsuits that would materially affect the business

4. DUE DILIGENCE
Buyer has completed its due diligence and accepts the business "as is" with no
further information required from Target.

5. CLOSING CONDITIONS
- All material contracts of Target shall be assumed by Buyer
- Any ongoing investigations shall not be grounds for termination
- Regulatory approvals are Buyer's responsibility

6. TAX MATTERS
Target makes no representations regarding taxes outside the United States.

7. EMPLOYEES
All employees shall be retained for 30 days post-closing.

8. INDEMNIFICATION
There is no indemnification provision in this Agreement. Buyer accepts all
liabilities of Target.

9. CONFIDENTIALITY
Neither party shall disparage the other. Breach results in $1,000,000
liquidated damages per incident.

10. GOVERNING LAW
This Agreement shall be governed by the laws of the British Virgin Islands.
Disputes resolved by arbitration in Luxembourg.

11. INTELLECTUAL PROPERTY
Target warrants it owns all material IP except as noted. Certain algorithms
are believed to be protected under common law but are not registered or
patented.

12. DATA INTEGRITY
Buyer acknowledges that certain financial data from Q4 2024 may no longer be
recoverable due to server migration.

13. TERMINATION
This Agreement may not be terminated by Buyer except for fraud. Seller may
terminate at any time for convenience.

14. ENTIRE AGREEMENT
[Intentionally left blank]

SIGNATURES:
Buyer Co: ___________ Target Co: ___________
"""


class TestSampleContract:
    """Tests against the actual sample contract from the M&A platform."""

    def test_detects_weak_merger_language(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        rules = [f.rule for f in result.findings]
        assert "merger_formation_defect" in rules, (
            "Should detect 'intend this to be a merger' as non-operative"
        )

    def test_merger_structure_invalid(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        assert result.merger_structure_valid is False

    def test_detects_indemnification_mismatch(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        rules = [f.rule for f in result.findings]
        assert "section_header_content_mismatch" in rules, (
            "§8 titled INDEMNIFICATION but eliminates indemnification"
        )

    def test_detects_confidentiality_mismatch(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        mismatch_findings = [
            f for f in result.findings
            if f.rule == "section_header_content_mismatch"
        ]
        headers_flagged = " ".join(f.location or "" for f in mismatch_findings)
        # §9 CONFIDENTIALITY contains no confidentiality provisions
        assert any(
            "9" in f.location or "CONFIDENTIAL" in f.description.upper()
            for f in mismatch_findings
        ), "§9 CONFIDENTIALITY mismatch should be detected"

    def test_detects_phantom_reference(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        rules = [f.rule for f in result.findings]
        assert "phantom_reference_detected" in rules, (
            "§11 'except as noted' is a phantom reference"
        )
        assert "except as noted" in result.phantom_references

    def test_detects_tax_gap(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        assert result.tax_gap_detected is True, (
            "Foreign tax disclaimer + no domestic tax rep = tax gap"
        )
        rules = [f.rule for f in result.findings]
        assert "tax_representation_completeness_gap" in rules

    def test_detects_currency_ambiguity(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        assert result.currency_specified is False, (
            "$50M + BVI/Luxembourg indicators + no USD spec = ambiguous"
        )
        rules = [f.rule for f in result.findings]
        assert "currency_specification_missing" in rules

    def test_detects_missing_admin_fields(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        assert len(result.missing_admin_fields) > 0, (
            "No effective date, no party jurisdiction in sample contract"
        )

    def test_total_deduction_is_positive(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        assert result.total_deduction > 0

    def test_total_deduction_reasonable_range(self, validator):
        """Formation deductions should be meaningful but not exceed ~60 points."""
        result = validator.run(SAMPLE_CONTRACT)
        assert 10 <= result.total_deduction <= 60, (
            f"Expected 10-60 points deducted, got {result.total_deduction}"
        )

    def test_all_findings_have_suggestions(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        for f in result.findings:
            assert f.suggestion is not None and len(f.suggestion) > 10, (
                f"Finding {f.rule} has no suggestion"
            )

    def test_all_findings_have_valid_severity(self, validator):
        result = validator.run(SAMPLE_CONTRACT)
        valid_severities = {"critical", "high", "medium", "low"}
        for f in result.findings:
            assert f.severity in valid_severities, (
                f"Finding {f.rule} has invalid severity '{f.severity}'"
            )


# ---------------------------------------------------------------------------
# Test: Clean / well-drafted contract (should produce minimal findings)
# ---------------------------------------------------------------------------

CLEAN_CONTRACT = """
AGREEMENT AND PLAN OF MERGER

This Agreement and Plan of Merger (this "Agreement") is dated as of January 15, 2026,
between Buyer Co, a Delaware corporation ("Buyer"), and Target Co, a Delaware corporation
("Target").

RECITALS:
Target shall merge with and into Buyer, with Buyer as the surviving entity
(the "Surviving Entity"), pursuant to the Delaware General Corporation Law (the "DGCL").
The Merger shall become effective upon the filing of a Certificate of Merger.

1. MERGER STRUCTURE
This is a forward triangular merger. Merger Sub shall merge with and into Target,
with Target surviving as a wholly-owned subsidiary of Buyer.
The effective time of the merger shall be the time of filing.

2. PURCHASE PRICE
The total purchase price shall be $50,000,000 USD (United States Dollars), payable as follows:
- $30,000,000 USD cash at closing
- $20,000,000 USD earnout based on Adjusted EBITDA of $8,000,000

3. REPRESENTATIONS AND WARRANTIES
Target represents and warrants that:
- Target has filed all required tax returns; all taxes have been paid
- Its financial statements are prepared in accordance with GAAP
- It is in compliance in all material respects with all applicable laws

4. DUE DILIGENCE
Buyer has conducted due diligence and is satisfied with the results.

5. CLOSING CONDITIONS
Closing is conditioned on: (a) bring-down of representations; (b) no Material Adverse Effect;
(c) receipt of required regulatory approvals. Seller shall cooperate with all filings.

6. TAX MATTERS
Target has filed all material tax returns required to be filed in all applicable jurisdictions.
All taxes shown on such returns have been paid. No material tax deficiency has been asserted.
No tax audit or proceeding is pending or threatened.

7. EMPLOYEES
Key Personnel (as listed on Schedule A) shall be retained for 24 months post-closing.
All employees shall be retained for 12 months post-closing.

8. INDEMNIFICATION
Seller shall indemnify, defend, and hold harmless Buyer from any losses arising from
breach of representations, warranties, or covenants. Cap: 20% of purchase price.
Fraud carve-out: uncapped.

9. CONFIDENTIALITY
Each party shall maintain the confidentiality of the other party's proprietary information.
Confidential information shall not be disclosed to third parties. Non-disclosure obligations
survive for 3 years post-closing.

10. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Delaware.
Disputes resolved by ICC arbitration in New York, with three arbitrators.
Emergency relief available in any court of competent jurisdiction.

11. INTELLECTUAL PROPERTY
Target warrants it owns all material intellectual property including patents, copyrights,
and trade secrets. All algorithms are protected by registered patents or trade secrets
maintained under reasonable confidentiality measures.

12. DATA INTEGRITY
Target represents that all financial data is complete and accurate.
No financial records have been destroyed or made unrecoverable.

13. TERMINATION
This Agreement may be terminated: (a) by mutual consent; (b) by Buyer for material breach
(with 10-day cure period); (c) by Seller for material breach (with 10-day cure period);
(d) by either party if closing has not occurred by the Outside Date of December 31, 2026.

14. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties and supersedes all
prior agreements, representations, and understandings. This Agreement may be amended only
by written instrument signed by both parties.

NOTICES: All notices shall be in writing and delivered to the addresses set forth herein.

SIGNATURES:
Buyer Co: ___________ Target Co: ___________
Dated: January 15, 2026
"""


class TestCleanContract:
    """A well-drafted contract should produce few or no formation findings."""

    def test_merger_structure_valid(self, validator):
        result = validator.run(CLEAN_CONTRACT)
        assert result.merger_structure_valid is True

    def test_no_merger_formation_defect(self, validator):
        result = validator.run(CLEAN_CONTRACT)
        rules = [f.rule for f in result.findings]
        assert "merger_formation_defect" not in rules

    def test_no_phantom_references(self, validator):
        result = validator.run(CLEAN_CONTRACT)
        assert len(result.phantom_references) == 0

    def test_no_tax_gap(self, validator):
        result = validator.run(CLEAN_CONTRACT)
        assert result.tax_gap_detected is False

    def test_currency_specified(self, validator):
        result = validator.run(CLEAN_CONTRACT)
        assert result.currency_specified is True

    def test_minimal_total_deduction(self, validator):
        """Clean contract should have low or zero formation deductions."""
        result = validator.run(CLEAN_CONTRACT)
        assert result.total_deduction <= 10, (
            f"Clean contract should have ≤10 formation deductions, "
            f"got {result.total_deduction}"
        )


# ---------------------------------------------------------------------------
# Test: Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_empty_string(self, validator):
        """Empty input should not raise — should return empty result."""
        result = validator.run("")
        assert isinstance(result, FormationValidationResult)
        assert result.total_deduction == 0

    def test_non_merger_agreement(self, validator):
        """Asset purchase agreements should not trigger merger checks."""
        text = """
        ASSET PURCHASE AGREEMENT
        Buyer shall purchase all assets of Seller for $10,000,000 USD.
        Dated as of March 1, 2026.
        Buyer Co, a Delaware corporation.
        Written notice shall be provided to the addresses below.
        """
        result = validator.run(text)
        rules = [f.rule for f in result.findings]
        assert "merger_formation_defect" not in rules, (
            "Merger checks should not fire on non-merger agreements"
        )

    def test_multiple_phantom_references(self, validator):
        """Multiple phantom refs should all be detected, capped at max deduction."""
        text = """
        MERGER AGREEMENT - dated 2026-01-15
        Buyer Co, a Delaware corporation, shall merge with and into Target Co,
        with Target Co as the surviving entity, pursuant to the Delaware General
        Corporation Law. The effective time of the merger shall be upon filing.
        
        Intellectual property except as noted.
        Liabilities as set forth in schedule A.
        Contracts see exhibit B.
        Employees see schedule C.
        Tax matters as described in annex D.
        
        6. TAX MATTERS
        Target has filed all required tax returns. All taxes have been paid.
        """
        result = validator.run(text)
        assert len(result.phantom_references) >= 2
        # Deduction should be capped
        phantom_finding = next(
            (f for f in result.findings if f.rule == "phantom_reference_detected"),
            None
        )
        if phantom_finding:
            max_cap = validator.deductions.get("phantom_reference_cap", 12)
            assert phantom_finding.deduction <= max_cap

    def test_strong_merger_language_overrides_weak(self, validator):
        """If strong merger language present, weak language should not flag."""
        text = """
        MERGER AGREEMENT
        The parties intend this to be a merger.
        Target shall merge with and into Buyer, with Buyer as the surviving entity.
        Effective time of the merger shall be upon filing.
        """
        result = validator.run(text)
        rules = [f.rule for f in result.findings]
        assert "merger_formation_defect" not in rules, (
            "Strong merger language should override weak intent language"
        )

    def test_indemnification_negation_detected(self, validator):
        """§8-style negation of indemnification should be caught."""
        text = """
        MERGER AGREEMENT - dated 2026-01-15
        Buyer Co, a Delaware corporation.
        Written notice shall be provided.
        Target shall merge with and into Buyer, with Buyer as the surviving entity,
        pursuant to the Delaware General Corporation Law.
        Effective time of the merger shall be upon filing.
        Forward merger structure.
        
        6. TAX MATTERS
        Target has filed all tax returns. All taxes paid.
        
        8. INDEMNIFICATION
        There is no indemnification provision in this Agreement.
        Buyer accepts all liabilities of Target.
        """
        result = validator.run(text)
        mismatch_findings = [
            f for f in result.findings
            if f.rule == "section_header_content_mismatch"
        ]
        assert len(mismatch_findings) > 0, (
            "Negated indemnification section should be flagged as mismatch"
        )
        negated = [f for f in mismatch_findings if "negated" in f.description.lower()]
        assert len(negated) > 0

    def test_findings_are_castable_to_risk_finding(self, validator):
        """
        All FormationFindings must have fields matching RiskFinding schema
        so they can be directly appended to the main findings list.
        """
        result = validator.run(SAMPLE_CONTRACT)
        required_fields = {"rule", "deduction", "description", "severity"}
        for finding in result.findings:
            finding_dict = {
                "rule": finding.rule,
                "deduction": finding.deduction,
                "description": finding.description,
                "severity": finding.severity,
                "location": finding.location,
                "suggestion": finding.suggestion,
            }
            for field in required_fields:
                assert field in finding_dict and finding_dict[field] is not None, (
                    f"FormationFinding missing required field '{field}'"
                )

    def test_deductions_never_negative(self, validator):
        """No individual finding should have a negative deduction."""
        result = validator.run(SAMPLE_CONTRACT)
        for finding in result.findings:
            assert finding.deduction >= 0, (
                f"Finding {finding.rule} has negative deduction {finding.deduction}"
            )

    def test_total_deduction_equals_sum_of_findings(self, validator):
        """total_deduction should equal sum of individual finding deductions."""
        result = validator.run(SAMPLE_CONTRACT)
        expected = sum(f.deduction for f in result.findings)
        assert result.total_deduction == expected, (
            f"total_deduction ({result.total_deduction}) != "
            f"sum of finding deductions ({expected})"
        )
