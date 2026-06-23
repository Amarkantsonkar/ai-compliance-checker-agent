# AI Documentation Compliance Agent

## How To Run The Project

### 1. Open Project Folder

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
```

### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
npx playwright install chromium
npm install --prefix client
```

### 3. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_real_gemini_key
```

Make sure these values are present:

```env
TARGET_URL=https://white-cliff-0bca3ed00.1.azurestaticapps.net/
LOGIN_EMAIL=admin@gmail.com
LOGIN_PASSWORD=password
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
CHROMA_URL=http://localhost:8000
GUIDELINES_COLLECTION=guidelines_collection
WEBSITE_COLLECTION=website_collection
GUIDELINES_PDF_PATH=/home/amar/Desktop/WaiverPro-User-Guidelines.pdf
HEADLESS=true
```

### 4. Start ChromaDB

Open a new terminal:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
.venv-chroma/bin/chroma run --host localhost --port 8000
```

Keep this terminal running.

If `.venv-chroma` does not exist, create it:

```bash
python3 -m venv .venv-chroma
.venv-chroma/bin/pip install chromadb
.venv-chroma/bin/chroma run --host localhost --port 8000
```

Verify ChromaDB:

```bash
curl -s http://localhost:8000/api/v2/heartbeat
```

### 5. Start Backend

Open another terminal:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
npm run start
```

Verify backend:

```bash
curl -s http://localhost:3000/health
```

If port `3000` is already busy:

```bash
npm run start:3001
```

### 6. Start Frontend

Open another terminal:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
npm run client:dev
```

Open in browser:

```text
http://localhost:5173
```

If backend is running on `3001`, start frontend like this:

```bash
npm run client:dev:3001
```

### 7. Run From Frontend

Open:

```text
http://localhost:5173
```

Click:

```text
Run Fast Evaluation
```

This is the recommended demo/evaluation run.

### 8. Run From Terminal

Fast evaluation mode:

```bash
npm run pipeline:evaluate
```

Full AI mode:

1. Authenticate and save session:

```bash
npm run auth
```

Expected output:

```text
Authentication module completed
```

Expected file:

```text
data/session/auth-storage-state.json
```

2. Crawl authenticated pages:

```bash
npm run crawl:pages
```

Expected files:

```text
data/ui/pages.json
data/ui/coverage.json
data/ui/crawl-failures.json
screenshots/*.png
```

Expected coverage shape:

```json
{
  "pages_discovered": 12,
  "pages_crawled": 12,
  "pages_failed": 0,
  "screenshots_captured": 12
}
```

3. Extract UI components:

```bash
npm run extract:components
```

Expected file:

```text
data/ui/components.json
```

Expected component shape:

```json
{
  "page_url": "/dashboard/my-applications",
  "component_type": "button",
  "component_selector": "#tour-new-application",
  "actual_text_content": "+ New Application",
  "screenshot_path": "screenshots/dashboard-my-applications.png",
  "retrieved_at": "..."
}
```

4. Parse PDF and extract rules:

```bash
npm run ingest
```

Expected files:

```text
data/guidelines/waiverpro-guidelines.raw.txt
data/guidelines/guideline-pages.json
data/guidelines/guideline-chunks.json
data/guidelines/rules.json
data/guidelines/guideline-rules.json
```

Expected rule shape:

```json
{
  "section": "Section 1",
  "subsection": "About This Guide",
  "guideline_text": "WaiverPro must operate as a web-based platform.",
  "source_page": 3
}
```

5. Index guideline chunks in ChromaDB:

```bash
npm run index:guidelines
```

Expected output:

```text
Guidelines indexed in ChromaDB
```

6. Generate website summaries:

```bash
npm run summarize:website
```

Expected files:

```text
data/summaries/website-summaries.json
data/summaries/website-*.md
```

Expected summary shape:

```json
{
  "page_url": "/dashboard/my-applications",
  "semantic_summary": "Page summary...",
  "key_elements": ["button: + New Application"],
  "screenshot_path": "screenshots/dashboard-my-applications.png"
}
```

7. Index website summaries in ChromaDB:

```bash
npm run index:website
```

Expected output:

```text
Website summaries indexed in ChromaDB
```

8. Run compliance comparison:

```bash
npm run compare
```

Expected file:

```text
data/reports/discrepancies.json
```

Expected discrepancy shape:

```json
{
  "page_url": "/dashboard/action-items",
  "guideline_reference": "Section 4, The header, source_page 8",
  "expected_text_content": "Logout button",
  "actual_text_content": "Not found in supplied UI evidence",
  "discrepancy_flag": true,
  "discrepancy_reason": "Explanation of mismatch",
  "screenshot_path": "screenshots/dashboard-action-items.png",
  "retrieved_at": "..."
}
```

9. Generate final report:

```bash
npm run report
```

Expected files:

```text
data/reports/report.json
data/reports/report.md
data/reports/final-report.md
data/reports/coverage.json
```

Expected report shape:

```json
{
  "overall": {
    "status": "PASS",
    "compliance_score": 100,
    "pages_reviewed": 11,
    "total_checks": 593,
    "passed_checks": 593,
    "failed_checks": 0,
    "violations_count": 0
  }
}
```

### 9. Ask Questions

```bash
npm run ask:examples
npm run ask -- "Which pages violate the documentation?"
npm run ask -- "Show all failed checks."
npm run ask -- "Show evidence for each discrepancy."
```

### 10. Output Files

```text
data/ui/pages.json
data/ui/components.json
data/guidelines/rules.json
data/summaries/website-summaries.json
data/reports/discrepancies.json
data/reports/report.json
data/reports/report.md
screenshots/
```

### 11. Build Frontend

```bash
npm run client:build
```

### 12. Common Run Notes

If browser login fails:

```env
HEADLESS=false
```

Then run:

```bash
npm run auth
```

If Gemini quota is exhausted, use:

```bash
npm run pipeline:evaluate
```

If `chroma run` gives error, use:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```
