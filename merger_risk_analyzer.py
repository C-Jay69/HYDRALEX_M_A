# merger_risk_analyzer.py  (repo root — CONSOLIDATED)
#
# Single source of truth: packages/python-engine/merger_risk_analyzer.py
#
# This repository previously shipped two divergent copies of the M&A risk
# analyzer (this file and packages/python-engine/merger_risk_analyzer.py).
# They have been consolidated: all detection logic now lives in the
# packages/python-engine copy (the canonical module), and this file is a thin
# re-export shim so existing imports keep working:
#
#     from merger_risk_analyzer import MergerRiskAnalyzer, AnalysisResult
#
# DO NOT add detection / scoring logic here. Edit
# packages/python-engine/merger_risk_analyzer.py instead. The matching config
# is packages/python-engine/merger_scoring_config.yaml.

import importlib.util
import os
import sys

_PYENGINE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "packages", "python-engine"
)
if _PYENGINE_DIR not in sys.path:
    sys.path.insert(0, _PYENGINE_DIR)

# Load the canonical module under a distinct name to avoid a name collision
# with this very file (both are named merger_risk_analyzer.py).
_PYENGINE_FILE = os.path.join(_PYENGINE_DIR, "merger_risk_analyzer.py")
_spec = importlib.util.spec_from_file_location("_pyengine_merger_risk_analyzer", _PYENGINE_FILE)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

MergerRiskAnalyzer = _module.MergerRiskAnalyzer
AnalysisResult = _module.AnalysisResult
RiskFinding = _module.RiskFinding

__all__ = ["MergerRiskAnalyzer", "AnalysisResult", "RiskFinding"]
