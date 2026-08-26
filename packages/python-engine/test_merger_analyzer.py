# test_merger_analyzer.py  (packages/python-engine — CONSOLIDATED)
#
# Single source of truth for the test fixtures lives in the repo-root
# test_merger_analyzer.py. This file re-runs that suite so the canonical
# engine (packages/python-engine/merger_risk_analyzer.py) is exercised by the
# exact same fixtures, with no duplicated/divergent test data.
#
# Run with:  python3 test_merger_analyzer.py   (from this directory)

import importlib.util
import os
import sys

_REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
_ROOT_TEST = os.path.join(_REPO_ROOT, "test_merger_analyzer.py")

_spec = importlib.util.spec_from_file_location("repo_root_test_merger_analyzer", _ROOT_TEST)
_root_test = importlib.util.module_from_spec(_spec)
sys.modules["repo_root_test_merger_analyzer"] = _root_test
_spec.loader.exec_module(_root_test)

TestMergerRiskAnalyzer = _root_test.TestMergerRiskAnalyzer
run_all_tests = _root_test.run_all_tests

if __name__ == "__main__":
    run_all_tests()
