# test_merger_analyzer.py
# Test suite for MergerRiskAnalyzer

import unittest
from pathlib import Path
from merger_risk_analyzer import MergerRiskAnalyzer, AnalysisResult

_ENGINE_DIR = Path(__file__).parent

class TestMergerRiskAnalyzer(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.analyzer = MergerRiskAnalyzer(str(_ENGINE_DIR / "merger_scoring_config.yaml"))
    
    # ============================================================
    # TEST CASE 1: Skeleton/Tier 1 Draft (like your sample)
    # ============================================================
    
    def test_skeleton_draft(self):
        """Test Case 1: Poor skeleton draft – expected score 15-25"""
        text = """
        1. Overview
        This Merger Agreement sets forth the terms for Acme to acquire Target.
        
        2. Purchase Price
        USD 84,750,000, with $9,750,000 deferred based on undisclosed metrics.
        
        3. Due Diligence
        Purchaser has completed preliminary due diligence and agrees no further disclosures required.
        
        4. Representations and Warranties
        Target has no known liabilities. Financial statements fairly present position.
        
        8. Closing Conditions
        All material contracts of the Target shall be assumed unless expressly excluded.
        Ongoing investigations shall not be grounds for termination.
        
        Schedule 14(c): Ongoing investigations
        """
        
        result = self.analyzer.analyze(text, "skeleton_draft.txt")
        
        # Assertions
        self.assertLess(result.final_score, 30, f"Score {result.final_score} should be <30")
        self.assertEqual(result.risk_level, "🔴 Critical Deficiencies")
        self.assertGreater(len(result.must_fix_items), 2)
        
        # Check specific issues detected
        finding_rules = [f.rule for f in result.findings]
        self.assertIn("undefined_metrics", finding_rules)
        self.assertIn("weasel_words_present", finding_rules)
        self.assertIn("diligence_vs_investigations", finding_rules)
        
        print(f"\n✅ Test 1 Passed: Skeleton draft scored {result.final_score}/100")
    
    # ============================================================
    # TEST CASE 2: Well-Drafted Agreement
    # ============================================================
    
    def test_well_drafted_agreement(self):
        """Test Case 2: Properly drafted agreement – expected score 75-85"""
        text = """
        ARTICLE I: DEFINITIONS
        "Material Adverse Effect" means any change that results in a reduction of 15% or more.
        "Knowledge" means actual knowledge of the CEO and CFO after reasonable inquiry.
        
        ARTICLE II: PURCHASE PRICE AND EARN OUT
        Earnout: $10,000,000 payable if Target achieves Revenue of $50M in FY2025.
        Disputes shall be resolved by independent accountant at Big 4 firm.
        
        ARTICLE III: REPRESENTATIONS AND WARRANTIES
        Target represents and warrants that its financial statements are accurate in all material respects.
        Survival: 18 months from Closing Date.
        
        ARTICLE IV: INDEMNIFICATION
        Seller shall indemnify Buyer for losses exceeding $250,000 (basket) up to $10M cap.
        Fraud carve-out: No cap for fraudulent misrepresentation.
        
        ARTICLE V: COVENANTS
        Target shall operate in the ordinary course pending Closing.
        
        ARTICLE VI: CLOSING CONDITIONS
        Outside Closing Date: March 31, 2026.
        
        ARTICLE VII: TERMINATION
        Either party may terminate if Closing not occurred by Outside Date.
        
        ARTICLE VIII: GENERAL PROVISIONS
        This Agreement constitutes the entire agreement between the parties.
        Governing Law: Delaware.
        """
        
        result = self.analyzer.analyze(text, "well_drafted.txt")
        
        # Assertions
        self.assertGreaterEqual(result.final_score, 70, f"Score {result.final_score} should be >=70")
        self.assertIn(result.risk_level, ["🟢 Low Risk", "✅ Minimal Risk"])
        
        # Should have few critical findings
        critical_findings = [f for f in result.findings if f.severity == 'critical']
        self.assertLess(len(critical_findings), 2)
        
        print(f"\n✅ Test 2 Passed: Well-drafted agreement scored {result.final_score}/100")
    
    # ============================================================
    # TEST CASE 3: Earnout Litigation Trap
    # ============================================================
    
    def test_earnout_litigation_trap(self):
        """Test Case 3: Undefined earnout – expected score 40-55"""
        text = """
        Purchase Price: $100M consisting of $70M cash + $30M earnout.
        Earnout payable based on performance metrics to be agreed.
        No dispute resolution mechanism specified.
        
        All other terms are well-drafted with indemnification and covenants.
        """
        
        result = self.analyzer.analyze(text, "earnout_trap.txt")
        
        # Should flag earnout issues
        finding_rules = [f.rule for f in result.findings]
        self.assertIn("undefined_metrics", finding_rules)
        self.assertIn("missing_dispute_resolution", finding_rules)
        
        # Interaction weighting should apply
        stacks = [s['name'] for s in result.interaction_stacks_triggered]
        self.assertIn("Earnout Litigation Stack", stacks)
        
        # Score should be penalized but not catastrophic
        self.assertLess(result.final_score, 60)
        
        print(f"\n✅ Test 3 Passed: Earnout trap scored {result.final_score}/100")
    
    # ============================================================
    # TEST CASE 4: Indemnity Nullification Stack
    # ============================================================
    
    def test_indemnity_nullification(self):
        """Test Case 4: No indemnity + weak reps – expected score 10-25"""
        text = """
        Representations: Target has no known liabilities.
        Financial statements fairly present the company's position.
        
        Buyer's post-closing remedies are not addressed in this agreement.
        
        Survival: Representations shall not survive Closing.
        
        All material contracts assumed without review.
        """
        
        result = self.analyzer.analyze(text, "indemnity_null.txt")
        
        # Should trigger indemnity nullification stack
        stacks = [s['name'] for s in result.interaction_stacks_triggered]
        self.assertIn("Indemnity Nullification Stack", stacks)
        
        # Score should be very low
        self.assertLess(result.final_score, 30)
        
        print(f"\n✅ Test 4 Passed: Indemnity nullification scored {result.final_score}/100")
    
    # ============================================================
    # TEST CASE 5: Perfect (Gold Standard) Agreement
    # ============================================================
    
    def test_gold_standard_agreement(self):
        """Test Case 5: Gold standard – expected score 90-100"""
        text = """
        THIS MERGER AGREEMENT is made as of [Date].
        
        ARTICLE I: DEFINITIONS
        "Material Adverse Effect" means any event that causes a reduction of 10% or more.
        "Knowledge" means actual knowledge after due inquiry of officers listed on Schedule A.
        "Closing Date" means the date set forth in the closing certificate.
        
        ARTICLE II: PURCHASE PRICE
        $100M cash at Closing. $20M earnout based on 2025 Revenue per GAAP.
        Earnout disputes resolved by independent accountant within 30 days.
        
        ARTICLE III: REPRESENTATIONS AND WARRANTIES
        Target hereby represents and warrants as follows:
        (a) Organization and Standing
        (b) Capitalization
        (c) Authority; Enforceability
        (d) Financial Statements (audited, GAAP)
        (e) Absence of Certain Changes
        (f) Litigation
        All representations survive Closing for 18 months.
        
        ARTICLE IV: INDEMNIFICATION
        Seller shall indemnify Buyer for losses exceeding $500,000 (basket) up to $15M cap.
        Fraud and fundamental reps: No cap, no basket.
        Survival: 18 months for general reps, 6 years for fundamental reps and tax.
        
        ARTICLE V: COVENANTS
        Target shall operate in ordinary course pending Closing.
        Seller shall provide access to books and records.
        
        ARTICLE VI: CLOSING CONDITIONS
        Outside Closing Date: 6 months from signing.
        Representations true and correct in all material respects.
        No MAE having occurred.
        
        ARTICLE VII: TERMINATION
        Either party may terminate if Closing not occurred by Outside Date.
        Mutual consent, material breach, or regulatory denial.
        
        ARTICLE VIII: GENERAL
        Entire agreement. Governing law: Delaware. Arbitration: Wilmington, DE.
        Counterparts. Severability. Notices.
        
        Schedules: All schedules attached and completed.
        """
        
        result = self.analyzer.analyze(text, "gold_standard.txt")
        
        # Assertions
        self.assertGreaterEqual(result.final_score, 85, f"Score {result.final_score} should be >=85")
        self.assertIn(result.risk_level, ["🟢 Low Risk", "✅ Minimal Risk"])
        
        # Should have very few findings
        self.assertLess(len(result.findings), 3)
        
        print(f"\n✅ Test 5 Passed: Gold standard scored {result.final_score}/100")
    
    # ============================================================
    # RUN ALL TESTS
    # ============================================================

def run_all_tests():
    print("\n" + "="*60)
    print("M&A MERGER RISK ANALYZER – TEST SUITE")
    print("="*60 + "\n")
    
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMergerRiskAnalyzer)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    
    return result

if __name__ == "__main__":
    run_all_tests()

