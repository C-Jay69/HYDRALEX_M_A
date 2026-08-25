# test_contract_qa.py
# Regression tests for the deterministic QA improvements:
#  - A1: schedule references preserve full sub-numbering (no "Schedule 1" truncation)
#  - A2: heavily-used defined terms are NOT flagged as "never referenced"
#  - Option 2: annotation stripping, governing-law extraction, reference audit

import unittest

from cross_document_consistency import CrossDocumentConsistencyEngine
from knowledge_graph import build_knowledge_graph_from_text
from contract_qa import run_contract_qa, extract_references, extract_governing_law


class TestScheduleReferenceExtraction(unittest.TestCase):
    def test_full_subnumbering_preserved(self):
        text = (
            "as set forth on Schedule 1.1(a) and Schedule 2.5 "
            "and Schedule 3.6 and Schedule 3.11"
        )
        engine = CrossDocumentConsistencyEngine()
        engine.add_document("doc", text)
        refs = engine.documents["doc"].schedule_refs

        self.assertIn("1.1(a)", refs)
        self.assertIn("2.5", refs)
        self.assertIn("3.6", refs)
        self.assertIn("3.11", refs)
        # The bug: truncating "Schedule 1.1(a)" to "Schedule 1".
        self.assertNotIn("1", refs)
        self.assertNotIn("3", refs)


class TestDeadDefinitionFalsePositive(unittest.TestCase):
    def test_heavily_used_term_not_flagged_dead(self):
        text = '''
        1.1 "Acquired Assets" means all assets of the Business.
        Buyer shall purchase all of the Acquired Assets.
        The Acquired Assets shall be transferred free and clear.
        Seller retains no interest in the Acquired Assets.
        '''
        kg = build_knowledge_graph_from_text(text, "doc")
        findings = kg.detect_missing_links(text)
        dead_names = [f.get("node_name") for f in findings if f.get("type") == "missing_link"]
        self.assertNotIn("Acquired Assets", dead_names)


class TestContractQa(unittest.TestCase):
    def test_annotation_contamination_detected(self):
        raw = (
            "1.1 'Acquired Assets' means all assets.\n"
            "🚩 This is a red flag comment not in the contract.\n"
            "ANSWER KEY: the buyer wins here.\n"
        )
        findings = run_contract_qa(raw)
        types = [f["type"] for f in findings]
        self.assertIn("annotation_contamination", types)

    def test_schedule_reference_audit(self):
        refs = extract_references("See Schedule 1.1(a) and Exhibit A and Section 7.3(b).")
        self.assertIn("Schedule 1.1(a)", refs["schedule_refs"])
        self.assertIn("Exhibit A", refs["exhibit_refs"])
        self.assertIn("Section 7.3(b)", refs["section_refs"])

    def test_governing_law_extraction(self):
        text = (
            "Governing Law. This Agreement shall be governed by the laws "
            "of the State of Delaware."
        )
        gov = extract_governing_law(text)
        self.assertEqual(gov["general_governing_law"], "Delaware")


if __name__ == "__main__":
    unittest.main()
