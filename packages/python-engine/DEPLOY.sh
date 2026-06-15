# 1. Install dependencies
pip install fastapi uvicorn pyyaml pydantic reportlab PyPDF2 python-docx

# 2. Run tests
python test_merger_analyzer.py

# 3. Start API server
python api.py

# 4. Test API
curl -X POST "http://localhost:8000/analyze" \
  -F "file=@sample_merger.txt" \
  -F "options={\"perspective\":\"buyer\",\"output_format\":\"json\"}"

# 5. Docker deployment
docker build -t merger-analyzer .
docker run -p 8000:8000 merger-analyzer