from __future__ import annotations

import os
import re
import pickle
from datetime import datetime
from typing import Dict, List, Optional, Any

class PrecedentCase:
    def __init__(self, case_id, contract_text, risk_score, risk_level, findings, recommendation, outcome, metadata=None):
        self.case_id = case_id
        self.contract_text = contract_text
        self.risk_score = risk_score
        self.risk_level = risk_level
        self.findings = findings
        self.recommendation = recommendation
        self.outcome = outcome
        self.metadata = metadata or {}
        self.created_at = datetime.now().isoformat()
    
    def to_dict(self):
        return {
            "case_id": self.case_id,
            "risk_score": self.risk_score,
            "risk_level": self.risk_level,
            "findings": self.findings,
            "recommendation": self.recommendation,
            "outcome": self.outcome,
            "metadata": self.metadata,
            "created_at": self.created_at
        }
    
    @classmethod
    def from_dict(cls, data):
        case = cls(
            case_id=data["case_id"],
            contract_text=data.get("contract_text", ""),
            risk_score=data["risk_score"],
            risk_level=data["risk_level"],
            findings=data["findings"],
            recommendation=data["recommendation"],
            outcome=data["outcome"],
            metadata=data.get("metadata")
        )
        case.created_at = data.get("created_at", case.created_at)
        return case

class PrecedentDatabase:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join("packages/python-engine/precedent_data", "precedent_cases.pkl")
        self.db_path = db_path
        self.cases = {}
        self.load()
    
    def load(self):
        if os.path.exists(self.db_path):
            with open(self.db_path, "rb") as f:
                data = pickle.load(f)
                if isinstance(data, list):
                    for item in data:
                        case = PrecedentCase.from_dict(item)
                        self.cases[case.case_id] = case
                elif isinstance(data, dict):
                    for case_id, case_data in data.items():
                        case = PrecedentCase.from_dict(case_data)
                        self.cases[case_id] = case
    
    def save(self):
        with open(self.db_path, "wb") as f:
            data = {case.case_id: case.to_dict() for case in self.cases.values()}
            pickle.dump(data, f)
    
    def add_case(self, case):
        self.cases[case.case_id] = case
        self.save()
    
    def get_case(self, case_id):
        return self.cases.get(case_id)
    
    def get_cases_by_outcome(self, outcome):
        return [case for case in self.cases.values() if case.outcome == outcome]
    
    def get_cases_by_risk_level(self, risk_level):
        return [case for case in self.cases.values() if case.risk_level == risk_level]
    
    def get_similar_cases(self, risk_score, n=5):
        similar = []
        for case in self.cases.values():
            if abs(case.risk_score - risk_score) <= 15:
                similar.append(case)
        similar.sort(key=lambda c: abs(c.risk_score - risk_score))
        return similar[:n]

def extract_precedent_features(text):
    import re
    return {
        "has_earnout": bool(re.search(r"earnout|earn.out", text, re.IGNORECASE)),
        "has_indemnification": bool(re.search(r"indemnif", text, re.IGNORECASE)),
        "has_survival_period": bool(re.search(r"survive", text, re.IGNORECASE)),
        "has_tax_representations": bool(re.search(r"tax", text, re.IGNORECASE)),
        "has_fundamental_reps": bool(re.search(r"fundamental", text, re.IGNORECASE)),
        "has_cap": bool(re.search(r"cap", text, re.IGNORECASE)),
        "has_basket": bool(re.search(r"basket", text, re.IGNORECASE)),
        "has_survival_days": bool(re.search(r"\d+\s*(?:days|months|years)", text, re.IGNORECASE)),
        "has_definitions": bool(re.search(r"(?:means|shall mean)", text, re.IGNORECASE)),
        "has_covenants": bool(re.search(r"Seller.*shall|Buyer.*shall", text, re.IGNORECASE)),
        "has_termination": bool(re.search(r"termination|outside date", text, re.IGNORECASE)),
        "has_disclosure": bool(re.search(r"disclos|schedule", text, re.IGNORECASE)),
        "has_regulatory": bool(re.search(r"CFIUS|HSR|regulatory", text, re.IGNORECASE)),
        "has_fcpa": bool(re.search(r"foreign.*official|willful", text, re.IGNORECASE)),
    }

class PrecedentModel:
    def __init__(self, database):
        self.database = database
        self.is_trained = False
    
    def predict(self, features):
        if not self.is_trained or not self.database.cases:
            return self._rule_based_prediction(features)
        
        # Find similar cases based on risk_score proximity
        target_score = features.get("score")
        target_score = target_score if target_score is not None else 50
        similar = self.database.get_similar_cases(target_score, n=5)
        
        if similar:
            # Use the single most similar case (closest in risk_score)
            closest = similar[0]
            
            return {
                "predicted_risk_score": closest.risk_score,
                "predicted_risk_level": closest.risk_level,
                "outcome_probability": {
                    "successful": 
                        sum(1 for c in similar if c.outcome in ["successful", "restructured"]) / len(similar) 
                        if similar else 0.5,
                    "failed": 
                        sum(1 for c in similar if c.outcome in ["failed", "litigated"]) / len(similar) 
                        if similar else 0.5,
                },
                "similar_cases": [c.case_id for c in similar],
                "method": "precedent_based"
            }
        else:
            # Fall back to rule-based prediction
            return self._rule_based_prediction(features)
    
    def _rule_based_prediction(self, features):
        score = features.get("score")
        if score is None:
            score = 50
        if features.get("has_earnout"):
            score += 15
        if features.get("has_tax_representations"):
            score += 10
        if features.get("has_fundamental_reps"):
            score += 20
        if features.get("has_cap") and features.get("has_basket"):
            score -= 5
        score = max(0, min(100, score))
        if score >= 70:
            risk_level = "critical"
        elif score >= 50:
            risk_level = "high"
        elif score >= 30:
            risk_level = "moderate"
        else:
            risk_level = "low"
        return {
            "predicted_risk_score": score,
            "predicted_risk_level": risk_level,
            "outcome_probability": {"successful": 0.5, "failed": 0.5},
            "method": "rule_based",
            "similar_cases": []
        }

def train_model(database_path=None):
    from precedent_data import PrecedentDatabase
    db = PrecedentDatabase(database_path) if database_path else PrecedentDatabase()
    if not db.cases:
        print("No precedent cases found. Model untrained.")
        return None, db
    print(f"Model trained on {len(db.cases)} precedent cases")
    model = PrecedentModel(db)
    model.is_trained = True
    return model, db
