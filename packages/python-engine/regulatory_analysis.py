# regulatory_analysis.py
# Regulatory Analysis Module
# Identifies applicable regulatory frameworks for M&A transactions

from __future__ import annotations
from typing import Dict, List, Set, Tuple
from dataclasses import dataclass, field
import re


@dataclass
class RegulatoryFinding:
    """Single regulatory analysis finding"""
    regulation_type: str  # e.g., "federal_securities", "delaware_corporate_law"
    description: str
    severity: str  # critical | high | moderate | low
    evidence: str
    jurisdiction: str = ""
    requires_approval: bool = False
    timeline_days: int | None = None
    exemptions_available: bool = False
    contact_agency: str = ""
    suggested_compliance: str = ""


class RegulatoryAnalysisModule:
    """Analyzes regulatory requirements for M&A transactions"""

    def __init__(self):
        self.regulatory_frameworks = self._build_regulatory_frameworks()
        self.sector_specific = self._build_sector_specific_frameworks()
        self.jurisdiction_cache: Dict[str, str] = {}

    def _build_regulatory_frameworks(self) -> Dict[str, Dict]:
        """Build comprehensive regulatory framework database"""
        return {
            # United States Federal Securities
            "federal_securities": {
                "description": "Federal securities laws govern disclosure, anti-fraud provisions, and registration requirements for securities offerings.",
                "primary_statutes": ["Securities Act of 1933", "Securities Exchange Act of 1934", "Sarbanes-Oxley Act of 2002", "Dodd-Frank Act"],
                "key_provisions": [
                    "Section 5 registration requirements",
                    "Section 10(b) and Rule 10b-5 anti-fraud",
                    "Section 13(d) beneficial ownership reporting",
                    "Section 16 insider trading reporting"
                ],
                "trigger_threshold": {"transaction_value_usd": 10_000_000, "public_company": True},
                "approval_required": True,
                "typical_timeline_days": 30,
                "agency": "SEC",
                "exemptions_available": True,
                "exemption_types": ["Regulation D", "Regulation A+", "Rule 144", "Private placement"],
                "compliance_checklist": [
                    "File Form S-4 or S-3 for registration statement",
                    "Prepare proxy statement DEF 14A",
                    "File beneficial ownership reports Schedule 13D/G",
                    "Conduct insider trading compliance review"
                ]
            },

            # Delaware General Corporation Law
            "delaware_corporate_law": {
                "description": "DGCL governs internal affairs of corporations incorporated in Delaware, including shareholder rights, director duties, and merger procedures.",
                "key_sections": [
                    "Section 251 - Merger and consolidation",
                    "Section 252 - Short-form merger",
                    "Section 253 - Parent-subsidiary merger",
                    "Section 262 - Appraisal rights",
                    "Section 141 - Board of directors",
                    "Section 144 - Conflicts of interest",
                    "Section 203 - Business combination statute"
                ],
                "trigger_threshold": {"incorporated_in_delaware": True},
                "approval_required": True,
                "typical_timeline_days": 21,
                "agency": "Delaware Secretary of State",
                "exemptions_available": False,
                "compliance_checklist": [
                    "File Certificate of Merger",
                    "Obtain board approval",
                    "Obtain shareholder approval (if required)",
                    "Provide appraisal rights notice",
                    "File annual franchise tax report"
                ]
            },

            # Hart-Scott-Rodino Antitrust Improvements Act
            "h_s_r": {
                "description": "HSR requires pre-merger notification and waiting period for certain transactions based on size-of-transaction and size-of-person tests.",
                "size_of_transaction_thresholds": {"base": 111_400_000, "adjustment_for_inflation": True},
                "size_of_person_thresholds": [{"party_a": 22_300_000, "party_b": 223_000_000}],
                "waiting_period_days": 30,
                "second_request_possible": True,
                "approval_required": True,
                "agency": "FTC/DOJ Antitrust Division",
                "exemptions_available": True,
                "exemption_types": ["Certain bank transactions", "Certain insurance transactions", "Certain real property"],
                "compliance_checklist": [
                    "File HSR Form and Response",
                    "Pay filing fee",
                    "Observe waiting period",
                    "Prepare for possible second request",
                    "Maintain documents for potential investigation"
                ]
            },

            # Committee on Foreign Investment in the United States
            "cfius": {
                "description": "CFIUS reviews certain foreign investments in U.S. businesses for national security implications.",
                "trigger_conditions": [
                    "foreign_person_acquires_us_business",
                    "foreign_person_acquires_control_us_person",
                    "foreign_govt_controlled_entity_investment"
                ],
                "review_types": ["Standard review", "Investigation", "Mitigation"],
                "approval_required": True,
                "typical_timeline_days": 75,
                "agency": "CFIUS (led by Treasury)",
                "exemptions_available": True,
                "exemption_types": ["Certain exempt transactions", "National interest waiver"],
                "compliance_checklist": [
                    "File Declaration (Form BE-13)",
                    "Submit notification if required",
                    "Observe review period",
                    "Negotiate mitigation agreement if needed",
                    "Obtain written clearance"
                ]
            },

            # Foreign Corrupt Practices Act
            "fcpa": {
                "description": "FCPA prohibits bribery of foreign officials and requires accurate books and records.",
                "key_provisions": [
                    "Anti-bribery provisions",
                    "Accounting provisions (books and records, internal controls)"
                ],
                "trigger_conditions": [
                    "us_person_or_issuer",
                    "foreign_official_involved",
                    "thing_of_value_offered"
                ],
                "approval_required": False,  # Compliance requirement, not approval
                "agency": "DOJ/SEC",
                "exemptions_available": False,
                "compliance_checklist": [
                    "Implement FCPA compliance program",
                    "Conduct third-party due diligence",
                    "Maintain accurate books and records",
                    "Train employees and agents",
                    "Monitor and audit compliance"
                ]
            },

            # Export Controls
            "export_controls": {
                "description": "Export controls regulate export of certain goods, technology, and services for national security and foreign policy reasons.",
                "regulatory_frameworks": ["EAR (Export Administration Regulations)", "ITAR (International Traffic in Arms Regulations)"],
                "trigger_conditions": [
                    "exports_controlled_goods_technology",
                    "reexports_or_transfers",
                    "deemed_exports",
                    "foreign_personnel_access"
                ],
                "approval_required": True,
                "agency": "Bureau of Industry and Security (BIS) for EAR, DDTC for ITAR",
                "exemptions_available": True,
                "exemption_types": ["License exceptions", "Technology and software exemptions", "Government approvals"],
                "compliance_checklist": [
                    "Classify items under ECCN or USML",
                    "Determine if license required",
                    "Obtain necessary export licenses",
                    "Screen parties against denied persons lists",
                    "Maintain export documentation"
                ]
            },

            # GDPR (General Data Protection Regulation)
            "gdpr": {
                "description": "GDPR governs processing of personal data of individuals in the European Economic Area.",
                "jurisdiction": "European Economic Area",
                "key_principles": [
                    "Lawfulness, fairness, and transparency",
                    "Purpose limitation",
                    "Data minimization",
                    "Accuracy",
                    "Storage limitation",
                    "Integrity and confidentiality",
                    "Accountability"
                ],
                "trigger_conditions": [
                    "processes_personal_data_european_residents",
                    "offers_goods_services_to_eu_residents",
                    "monitors_behavior_of_eu_residents"
                ],
                "approval_required": False,
                "agency": "National Data Protection Authorities",
                "exemptions_available": False,
                "fines_up_to": "4% of global annual turnover or €20 million, whichever is higher",
                "compliance_checklist": [
                    "Appoint Data Protection Officer if required",
                    "Conduct Data Protection Impact Assessment",
                    "Implement privacy by design and default",
                    "Maintain records of processing activities",
                    "Ensure cross-border transfer mechanisms"
                ]
            },

            # CCPA (California Consumer Privacy Act)
            "ccpa": {
                "description": "CCPA grants California residents rights regarding their personal information and imposes obligations on businesses.",
                "jurisdiction": "California, USA",
                "key_rights": [
                    "Right to know",
                    "Right to delete",
                    "Right to opt-out of sale",
                    "Right to non-discrimination"
                ],
                "trigger_conditions": [
                    "does_business_in_california",
                    "meets_revenue_or_data_thresholds",
                    "collects_personal_information"
                ],
                "approval_required": False,
                "agency": "California Attorney General",
                "exemptions_available": False,
                "fines_up_to": "$7,500 per intentional violation",
                "compliance_checklist": [
                    "Update privacy policy",
                    "Implement consumer request procedures",
                    "Maintain opt-out of sale mechanism",
                    "Conduct data mapping and inventory",
                    "Train employees on CCPA requirements"
                ]
            },

            # HIPAA (Health Insurance Portability and Accountability Act)
            "hipaa": {
                "description": "HIPAA sets standards for protecting sensitive patient health information.",
                "jurisdiction": "United States",
                "key_rules": [
                    "Privacy Rule",
                    "Security Rule",
                    "Breach Notification Rule",
                    "Enforcement Rule"
                ],
                "trigger_conditions": [
                    "covered_entity_or_business_associate",
                    "handles_protected_health_information"
                ],
                "approval_required": False,
                "agency": "HHS Office for Civil Rights",
                "exemptions_available": False,
                "fines_up_to": "$1.5 million per violation category per year",
                "compliance_checklist": [
                    "Conduct risk analysis",
                    "Implement safeguards (administrative, physical, technical)",
                    "Develop policies and procedures",
                    "Train workforce",
                    "Execute business associate agreements",
                    "Implement breach notification procedures"
                ]
            },

            # Sarbanes-Oxley Act
            "sox": {
                "description": "SOX establishes requirements for public company boards, management, and public accounting firms.",
                "key_sections": [
                    "Section 302 - Corporate responsibility for financial reports",
                    "Section 404 - Management assessment of internal controls",
                    "Section 409 - Real time issuer disclosures",
                    "Section 802 - Criminal penalties for altering documents",
                    "Section 806 - Whistleblower protection"
                ],
                "trigger_conditions": [
                    "issuer_with_securities_registered_under_section_12",
                    "issuer_required_to_file_reports_under_section_15d"
                ],
                "approval_required": False,
                "agency": "SEC",
                "exemptions_available": False,
                "compliance_checklist": [
                    "Maintain internal control over financial reporting",
                    "Conduct annual internal control assessment",
                    "Have auditors attest to internal control assessment",
                    "Disclose material changes in internal control",
                    "Implement whistleblower protection program"
                ]
            }
        }

    def _build_sector_specific_frameworks(self) -> Dict[str, Dict]:
        """Build sector-specific regulatory frameworks"""
        return {
            "healthcare": {
                "regulations": [
                    "HIPAA",
                    "HITECH Act",
                    "Stark Law (Physician Self-Referral)",
                    "Anti-Kickback Statute",
                    "FDA regulations (drugs, devices, biologics)",
                    "CMS regulations (Medicare/Medicaid)",
                    "CLIA (Clinical Laboratory Improvement Amendments)",
                    "Joint Commission accreditation requirements"
                ],
                "key_agencies": ["HHS", "FDA", "CMS"],
                "special_considerations": [
                    "Change of ownership notifications",
                    "Provider agreement transitions",
                    "Medicare/Medicaid enrollment changes",
                    "Stark/Anti-Kickback compliance review"
                ]
            },
            "financial_services": {
                "regulations": [
                    "Bank Holding Company Act",
                    "Glass-Steagall Act provisions",
                    "Basel III capital requirements",
                    "Volcker Rule",
                    "Community Reinvestment Act",
                    "Bank Secrecy Act / AML requirements"
                ],
                "key_agencies": ["Federal Reserve", "OCC", "FDIC", "CFPB"],
                "special_considerations": [
                    "Change in control approvals",
                    "Capital adequacy post-transaction",
                    "Community Reinvestment Act compliance",
                    "AML/BSA program integration"
                ]
            },
            "technology": {
                "regulations": [
                    "Export controls (EAR/ITAR)",
                    "CFIUS review for foreign investment",
                    "GDPR/CCPA data privacy",
                    "SEC cybersecurity disclosure rules"
                ],
                "key_agencies": ["BIS", "DDTC", "CFIUS", "SEC"],
                "special_considerations": [
                    "IP transfer restrictions",
                    "Open source license compliance",
                    "Data localization requirements",
                    "Cybersecurity program integration"
                ]
            }
        }

    def analyze_regulatory_landscape(self, answer_text: str) -> dict:
        """
        Analyze the given answer text to determine the applicable regulatory frameworks
        based on the text content and provide structured output.
        """
        applicable_regulations = []
        for framework_name, framework_data in self.regulatory_frameworks.items():
            # Check if any trigger conditions or key terms are mentioned in the answer text
            keywords_to_check = (
                framework_data.get("key_provisions", []) +
                framework_data.get("primary_statutes", []) +
                framework_data.get("key_sections", []) +
                framework_data.get("trigger_conditions", []) +
                [framework_name.replace("_", " ").title()]
            )
            if any(keyword.lower() in answer_text.lower() for keyword in keywords_to_check):
                applicable_regulations.append({
                    "framework": framework_name,
                    "description": framework_data["description"],
                    "severity": "high" if framework_data.get("approval_required") else "medium",
                    "jurisdiction": framework_data.get("jurisdiction", "USA"),
                    "requires_approval": framework_data.get("approval_required", False)
                })
        # Also check sector-specific frameworks
        for sector_name, sector_data in self.sector_specific.items():
            sector_keywords = (
                sector_data.get("key_agencies", []) +
                sector_data.get("regulations", []) +
                [sector_name.replace("_", " ").title()]
            )
            if any(keyword.lower() in answer_text.lower() for keyword in sector_keywords):
                applicable_regulations.append({
                    "framework": f"sector_{sector_name}",
                    "description": f"Sector-specific regulations for {sector_name}",
                    "severity": "medium",
                    "jurisdiction": "Varies",
                    "requires_approval": False
                })
        return {
            "applicable_regulations": applicable_regulations,
            "total_frameworks_checked": len(self.regulatory_frameworks) + len(self.sector_specific),
            "summary": f"Identified {len(applicable_regulations)} potentially applicable regulatory frameworks based on text analysis."
        }

    def get_framework_details(self, framework_name: str) -> Dict:
        """Get detailed information about a specific regulatory framework"""
        return self.regulatory_frameworks.get(framework_name, {})

    def get_sector_frameworks(self, sector: str) -> Dict:
        """Get sector-specific regulatory frameworks"""
        return self.sector_specific.get(sector, {})