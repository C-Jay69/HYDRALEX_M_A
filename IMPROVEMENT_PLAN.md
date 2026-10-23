# Agent G - UI/UX Improvements Implementation Plan

## Overview
Implementing UI/UX enhancements for Professional and Enterprise tiers of the HYDRALEX M&A contract analyzer.

## Phase 1: What-If Scenarios (Professional Tier)

### 1.1 Adjustable Survival Periods
- Add `survival_period_override` parameter to `MergerRiskAnalyzer.__init__()`
- Default: `None` (use detected value from document)
- Range: 6-60 months (12-36 month toggle for Professional)
- Recalculate risk score when overridden
- Save preference to user profile

### 1.2 Adjustable Caps/Baskets
- Add `indemnification_cap_pct` and `indemnification_basket_pct` parameters
- Default: `None` (use detected values from document)
- Cap range: 5-50%; Basket range: 0.5-5%
- Recalculate deduction when overridden
- Professional tier: user-adjustable; Enterprise: firm-preset

### 1.3 Adjustable Earnout Metrics
- Add `earnout_metric` parameter with options: `Revenue`, `EBITDA`, `Gross Profit`, `Net Income`, `Cash Flow`
- Default: `None` (use detected metric from document)
- Recalculate `undefined_metrics` finding severity when overridden
- If user selects a metric that IS in the document, remove the `undefined_metrics` deduction

### 1.4 Real-Time Score Recalculation
- Add `recalculate_score()` method that re-runs key checks with overridden parameters
- Return adjusted `final_score` and modified `findings`

### 1.5 Save User Preferences
- Store override values in user profile/settings
- Persist across sessions

## Phase 2: Interactive Output Customization (Professional Tier)

### 2.1 Report Section Toggle System
- Define 10+ output sections: `risk_score`, `executive_summary`, `defined_terms`, `covenants`, `indemnification`, `survival_periods`, `earnout`, `regulatory`, `disclosures`, `boilerplate`
- Add `output_sections` parameter to `format_output()` 
- Default: all sections shown
- User preferences saved to profile
- Checkbox-based MVP (can extend to drag-and-drop)

### 2.2 Output Customization Implementation
- Modify `MergerRiskAnalyzer.format_output()` to accept `sections` parameter
- Each section has a boolean flag showing/hiding it
- Section ordering preserved per user preference

## Phase 3: Enterprise Tier White-Label

### 3.1 Section Reordering
- 18 report sections (extending the Professional 10 with: `party_integrity`, `formation_validity`, `arbitration`, `strengths`, `missed_items`, `must_fix`, `adjusted_score`)
- Drag-and-drop or reorder control in UI
- User-saved template persists

### 3.2 Custom Commentary Sections
- Allow users to add free-text commentary that appears in the report
- Persist commentary per document/analysis

### 3.3 Save Custom Report Templates
- Users can save named templates with section selections, order, and branding
- Load/save from profile

### 3.4 Branded Output
- `company_logo` URL/path
- `color_scheme` (light/dark mode compatible)
- `firm_name` displayed on reports
- Store in user profile

### 3.5 Custom PDF Templates
- Base template with firm branding overlay
- Generate PDF with: logo at top, firm name header, custom color scheme
- Use report data as content source

## Phase 4: Usability Improvements (All Tiers)

### 4.1 Improved Suggestion Language
- Update suggestion text in config and analyzer to be more precise and actionable
- Reference the implemented taxonomy of defined terms, relationship types, etc.

### 4.2 Better Error Messages for Missing Sections
- Enhance messages when required sections are absent from documents
- Provide specific remediation guidance

### 4.3 Hover Tooltips on Knowledge Graph
- Add tooltip text to entity types and relationship types when rendering KG in UI
- Show definition and typical usage

### 4.4 Keyboard Navigation Support
- Add keyboard shortcuts for navigating report sections
- Tab/Shift+Tab to move between sections
- Arrow keys to expand/collapse sections

### 4.5 Dark Mode Compatibility
- Ensure all new UI elements support both light and dark themes
- Use system prefers-color-scheme media queries
- Test with existing partially-implemented dark mode

## Phase 5: Testing

### 5.1 Test Against All 10 Contracts
- Run analyzer on all 10 test contracts
- Verify no regressions in existing detection
- Validate what-if scenario overrides work correctly

### 5.2 Regression Test Suite
- Run existing pytest suite
- Verify all 10 contracts process successfully with no errors

## Phase 6: Compatibility

### 6.1 Existing Analyzer Compatibility
- All changes maintain backward compatibility
- Default behavior unchanged when no overrides specified
- Existing imports continue to work

### 6.2 Knowledge Graph Compatibility
- KG entities and relationships unchanged
- New parameters don't affect KG building

### 6.3 Cross-Document Consistency Compatibility
- Consistency engine unchanged
- New features don't affect cross-doc analysis

## Implementation Priority
1. What-if scenario parameters (analyzer config + code)
2. Output section toggles (format_output method)
3. Enterprise branding (user profile settings)
4. Usability improvements (suggestions, tooltips, dark mode)
5. Test against all 10 contracts
6. Final integration and polish