# api.py
# FastAPI production server for Merger Risk Analyzer

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import tempfile
import uuid
import asyncio
from pathlib import Path

from merger_risk_analyzer import MergerRiskAnalyzer, AnalysisResult

# Initialize
app = FastAPI(
    title="M&A Merger Risk Analyzer API",
    description="AI-powered risk scoring for merger agreements",
    version="2.0.0"
)

# CORS
import os
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Tier configuration and gating
TIER_CONFIG = {
    "free": {
        "name": "Free",
        "monthly_price": 1,
        "max_analyses_per_month": 1,
        "features": {
            "basic_analysis": True,
            "risk_scoring": True,
            "pdf_export": False,
            "knowledge_graph": False,
            "cross_doc_consistency": False,
            "clause_extraction": False,
            "earnout_analysis": False,
            "regulatory_analysis": False,
            "document_inventory": False,
            "ui_customization": False,
            "team_seats": 1,
            "analysis_history_days": 0,
            "api_access": False,
            "priority_support": False,
        }
    },
    "professional": {
        "name": "Professional",
        "monthly_price": 1500,
        "max_analyses_per_month": 10,
        "features": {
            "basic_analysis": True,
            "risk_scoring": True,
            "pdf_export": True,
            "knowledge_graph": True,
            "cross_doc_consistency": True,
            "clause_extraction": True,
            "earnout_analysis": True,
            "regulatory_analysis": False,
            "document_inventory": False,
            "ui_customization": True,
            "team_seats": 3,
            "analysis_history_days": 0,
            "api_access": True,
            "priority_support": True,
        }
    },
    "business": {
        "name": "Business",
        "monthly_price": 5000,
        "max_analyses_per_month": 50,
        "features": {
            "basic_analysis": True,
            "risk_scoring": True,
            "pdf_export": True,
            "knowledge_graph": True,
            "cross_doc_consistency": True,
            "clause_extraction": True,
            "earnout_analysis": True,
            "regulatory_analysis": True,
            "document_inventory": True,
            "ui_customization": True,
            "team_seats": 10,
            "analysis_history_days": 90,
            "api_access": True,
            "priority_support": True,
            "regulatory_checklists": True,
            "deal_type_checklists": True,
        }
    },
    "enterprise": {
        "name": "Enterprise",
        "monthly_price": "custom",
        "max_analyses_per_month": "unlimited",
        "features": {
            "basic_analysis": True,
            "risk_scoring": True,
            "pdf_export": True,
            "knowledge_graph": True,
            "cross_doc_consistency": True,
            "clause_extraction": True,
            "earnout_analysis": True,
            "regulatory_analysis": True,
            "document_inventory": True,
            "ui_customization": True,
            "team_seats": "unlimited",
            "analysis_history_days": -1,
            "api_access": True,
            "priority_support": True,
            "regulatory_checklists": True,
            "deal_type_checklists": True,
            "output_customization": True,
            "what_if_scenarios": True,
            "firm_precendent_training": True,
            "sla_999": True,
            "ssO_saml": True,
            "white_label_reports": True,
        }
    }
}

def get_tier_config(tier: str) -> dict:
    """Get configuration for a given tier."""
    return TIER_CONFIG.get(tier, TIER_CONFIG["professional"])

def has_feature(tier: str, feature: str) -> bool:
    """Check if a tier has access to a feature."""
    config = get_tier_config(tier)
    return config["features"].get(feature, False)# Initialize analyzer
analyzer = MergerRiskAnalyzer(str(Path(__file__).parent / "merger_scoring_config.yaml"))

# Request/Response Models
class AnalyzeOptions(BaseModel):
    include_detailed_findings: bool = True
    perspective: str = Field("buyer", pattern="^(buyer|seller|neutral)$")
    output_format: str = Field("json", pattern="^(json|scorecard|pdf)$")

class AnalyzeRequest(BaseModel):
    options: AnalyzeOptions = AnalyzeOptions()

class AnalysisResponse(BaseModel):
    metadata: Dict[str, Any]
    score: Dict[str, Any]
    findings: List[Dict[str, Any]]
    interaction_stacks: List[Dict[str, Any]]
    must_fix: List[Dict[str, Any]]
    arbitration_threshold: Optional[Dict[str, Any]]
    scorecard_url: Optional[str] = None
    merger_structure_valid: bool = True
    currency_specified: bool = True
    phantom_references: List[str] = []
    mismatched_sections: List[str] = []
    tax_gap_detected: bool = False
    formation_deductions: int = 0

class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str

# In-memory job store (use Redis in production)
jobs: Dict[str, Dict] = {}

# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        timestamp=datetime.now().isoformat()
    )

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    options: AnalyzeOptions = None,
    survival_period_override_months: Optional[int] = None,
    indemnification_cap_pct_override: Optional[float] = None,
    indemnification_basket_pct_override: Optional[float] = None,
    earnout_metric_override: Optional[str] = None
):
    """
    Analyze a merger agreement document

    - **file**: Merger agreement (PDF, DOCX, or TXT) up to 10MB
    - **options**: Analysis configuration
    - **survival_period_override_months**: Override survival period in months (6-60) — Enterprise tier
    - **indemnification_cap_pct_override**: Override cap percentage (5-50%) — Enterprise tier
    - **indemnification_basket_pct_override**: Override basket percentage (0.5-5%) — Enterprise tier
    - **earnout_metric_override**: Earnout metric selection (Revenue, EBITDA, Gross Profit, Net Income, Cash Flow) — Enterprise tier
    """

    # Validate file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)

    if size > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    # Validate file type
    allowed_extensions = {'.txt', '.pdf', '.docx'}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )

    # Read file content
    content = await file.read()

    # Extract text based on file type
    text = ""
    if file_ext == '.txt':
        text = content.decode('utf-8')
    elif file_ext == '.pdf':
        # Use PyPDF2 or pdfplumber
        try:
            import io
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = " ".join([page.extract_text() for page in pdf_reader.pages])
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF parsing library not installed")
    elif file_ext == '.docx':
        # Use python-docx
        try:
            import io
            from docx import Document
            doc = Document(io.BytesIO(content))
            text = " ".join([para.text for para in doc.paragraphs])
        except ImportError:
            raise HTTPException(status_code=500, detail="DOCX parsing library not installed")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text extracted from document")

    # Analyze with what-if overrides (Enterprise tier only)
    # Apply overrides to analyzer instance
    if survival_period_override_months is not None:
        analyzer.survival_period_override_months = survival_period_override_months
    if indemnification_cap_pct_override is not None:
        analyzer.indemnification_cap_pct_override = indemnification_cap_pct_override
    if indemnification_basket_pct_override is not None:
        analyzer.indemnification_basket_pct_override = indemnification_basket_pct_override
    if earnout_metric_override is not None:
        analyzer.earnout_metric_override = earnout_metric_override

    options = options or AnalyzeOptions()
    result = analyzer.analyze(text, document_name=file.filename)

    # Convert findings to dicts for JSON serialization
    findings_dicts = []
    for f in result.findings:
        fd = {
            "rule": f.rule,
            "deduction": f.deduction,
            "description": f.description,
            "severity": f.severity,
        }
        if f.location is not None:
            fd["location"] = f.location
        if f.suggestion is not None:
            fd["suggestion"] = f.suggestion
        findings_dicts.append(fd)

    # Build response
    response = AnalysisResponse(
        metadata={
            "document_name": file.filename,
            "timestamp": result.timestamp,
            "processing_time_ms": 0,  # Calculate if needed
            "perspective": options.perspective
        },
        score={
            "final_score": result.final_score,
            "risk_level": result.risk_level,
            "recommendation": result.recommendation
        },
        findings=findings_dicts if options.include_detailed_findings else [],
        interaction_stacks=result.interaction_stacks_triggered,
        must_fix=result.must_fix_items,
        arbitration_threshold=result.arbitration_threshold,
        merger_structure_valid=result.merger_structure_valid,
        currency_specified=result.currency_specified,
        phantom_references=result.phantom_references,
        mismatched_sections=result.mismatched_sections,
        tax_gap_detected=result.tax_gap_detected,
        formation_deductions=result.formation_deductions
    )
    
    # Generate scorecard PDF if requested
    if options.output_format == "pdf":
        job_id = str(uuid.uuid4())
        jobs[job_id] = {"status": "processing", "result": None}
        background_tasks.add_task(
            generate_scorecard_pdf,
            job_id,
            result,
            file.filename
        )
        response.scorecard_url = f"/download/{job_id}"
    
    return response

@app.get("/download/{job_id}")
async def download_scorecard(job_id: str):
    """Download generated scorecard PDF"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=202, detail="Still processing")
    
    return FileResponse(
        job["file_path"],
        media_type="application/pdf",
        filename=f"risk_scorecard_{job_id}.pdf"
    )

async def generate_scorecard_pdf(job_id: str, result: AnalysisResult, filename: str):
    """Background task to generate PDF scorecard"""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        
        output_path = f"/tmp/scorecard_{job_id}.pdf"
        doc = SimpleDocTemplate(output_path, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a2e')
        )
        story.append(Paragraph("M&A Merger Agreement Risk Scorecard", title_style))
        story.append(Spacer(1, 12))
        
        # Document info
        story.append(Paragraph(f"Document: {filename}", styles['Normal']))
        story.append(Paragraph(f"Analyzed: {result.timestamp}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Score section
        score_color = colors.HexColor('#e74c3c') if result.final_score < 50 else colors.HexColor('#f39c12') if result.final_score < 75 else colors.HexColor('#27ae60')
        score_style = ParagraphStyle(
            'ScoreStyle',
            parent=styles['Normal'],
            fontSize=48,
            textColor=score_color
        )
        story.append(Paragraph(f"Score: {result.final_score}/100", score_style))
        story.append(Paragraph(f"Risk Level: {result.risk_level}", styles['Normal']))
        story.append(Paragraph(f"Recommendation: {result.recommendation}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Must-fix items
        story.append(Paragraph("Must-Fix Items", styles['Heading2']))
        for item in result.must_fix_items:
            story.append(Paragraph(f"• {item['description']}", styles['Normal']))
            story.append(Paragraph(f"  Fix: {item['suggestion']}", styles['Italic']))
            story.append(Spacer(1, 6))
        
        doc.build(story)
        
        jobs[job_id] = {"status": "completed", "file_path": output_path}
        
    except Exception as e:
        jobs[job_id] = {"status": "failed", "error": str(e)}

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

