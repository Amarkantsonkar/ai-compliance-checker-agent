# AI Compliance Checker Runbook

This document contains the exact practical steps to run and verify this project from a fresh terminal.

## 1. Go To Project Folder

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
```

## 2. Install Node Dependencies

Use `--legacy-peer-deps` because the LangChain packages have optional peer dependency conflicts.

```bash
npm install --legacy-peer-deps
```

Install Playwright Chromium:

```bash
npx playwright install chromium
```

Verify:

```bash
node --version
npm --version
test -d node_modules && echo "node_modules OK"
```

Node should be version `20+`.

## 3. Configure Environment

Create `.env`:

```bash
cp .env.example .env
```

Open `.env` and make sure these values are present:

```env
TARGET_URL=https://white-cliff-0bca3ed00.1.azurestaticapps.net/
LOGIN_EMAIL=admin@gmail.com
LOGIN_PASSWORD=password
GEMINI_API_KEY=your_real_gemini_key
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
CHROMA_URL=http://localhost:8000
GUIDELINES_COLLECTION=guidelines_collection
WEBSITE_COLLECTION=website_collection
GUIDELINES_PDF_PATH=/home/amar/Desktop/WaiverPro-User-Guidelines.pdf
HEADLESS=true
CRAWL_MAX_PAGES=25
```

To visually debug browser login, set:

```env
HEADLESS=false
```

Test Gemini key:

```bash
node --input-type=module -e "import 'dotenv/config'; import { GoogleGenerativeAI } from '@google/generative-ai'; const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); const res = await model.generateContent('Reply with exactly OK'); console.log(res.response.text().trim());"
```

Expected:

```text
OK
```

## 4. Start ChromaDB

Do not run plain `chroma run ...` if your system uses `/usr/bin/chroma`. That command is the Go syntax highlighter, not ChromaDB.

Use the local ChromaDB virtual environment:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
.venv-chroma/bin/chroma run --host localhost --port 8000
```

Keep this terminal open.

Verify in another terminal:

```bash
curl -s http://localhost:8000/api/v2/heartbeat
```

Expected:

```json
{"nanosecond heartbeat":123456789}
```

If `.venv-chroma` does not exist, create it:

```bash
python3 -m venv .venv-chroma
.venv-chroma/bin/pip install chromadb
```

Then start ChromaDB again:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```

## 5. Start Backend Server

Open another terminal:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
npm run start
```

Keep this terminal open.

Verify:

```bash
curl -s http://localhost:3000/health
```

Expected:

```json
{"status":"ok","service":"ai-documentation-compliance-agent","timestamp":"..."}
```

Note: `http://localhost:3000/` returns 404. That is normal because this is an API server.

## 6. Run Syntax Check

```bash
for file in src/**/*.js src/*.js; do node --check "$file" || exit 1; done
```

Expected: no output.

## 7. Run Project Phases In Order

Run these commands from the project folder.

### Phase 2: Authentication

```bash
npm run auth
```

Expected:

```text
Authentication verified
Authentication module completed
```

Verify session:

```bash
ls data/session/auth-storage-state.json
```

### Phase 3: Crawl Pages

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

Verify:

```bash
cat data/ui/coverage.json
```

Expected shape:

```json
{
  "pages_discovered": 12,
  "pages_crawled": 12,
  "pages_failed": 0,
  "screenshots_captured": 12
}
```

If the command appears slow after writing outputs, check:

```bash
node -e "const p=require('./data/ui/pages.json'); console.log(p.length); console.log(p.map(x=>x.page_url).join('\n'));"
```

### Phase 4: Extract UI Components

```bash
npm run extract:components
```

Verify:

```bash
node -e "const c=require('./data/ui/components.json'); console.log(c.length); console.log(c[0]);"
```

Expected example:

```js
{
  page_url: '/dashboard/my-applications',
  component_type: 'button',
  component_selector: '#tour-new-application',
  actual_text_content: '+ New Application',
  screenshot_path: '...',
  retrieved_at: '...'
}
```

### Phase 5: Parse PDF And Extract Rules

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

Verify:

```bash
node -e "const r=require('./data/guidelines/rules.json'); console.log(r.length); console.log(r[0]);"
```

Useful real rules check:

```bash
node -e "const r=require('./data/guidelines/rules.json'); const useful=r.filter(x => x.section !== 'Unknown section' && x.source_page > 2); console.log(useful.length); console.log(useful.slice(0,10));"
```

### Phase 6: Index Guidelines In ChromaDB

```bash
npm run index:guidelines
```

Expected:

```text
Documents indexed in ChromaDB
Guidelines indexed in ChromaDB
```

Test guideline retrieval:

```bash
curl -s -X POST http://localhost:3000/api/vector/search \
  -H "Content-Type: application/json" \
  -d '{"collectionName":"guidelines_collection","query":"dashboard applications","limit":2}'
```

Expected: JSON with `results`.

### Phase 7: Summarize Website

```bash
npm run summarize:website
```

Expected files:

```text
data/summaries/website-summaries.json
data/summaries/website-*.md
```

Verify:

```bash
node -e "const s=require('./data/summaries/website-summaries.json'); console.log(s.length); console.log(s[0]);"
```

### Phase 7B: Index Website Evidence

```bash
npm run index:website
```

Expected:

```text
Website summaries indexed in ChromaDB
```

Test website retrieval:

```bash
curl -s -X POST http://localhost:3000/api/vector/search \
  -H "Content-Type: application/json" \
  -d '{"collectionName":"website_collection","query":"my applications dashboard new application","limit":2}'
```

Expected: JSON with `results`.

### Phase 8: Run Compliance Comparison

```bash
npm run compare
```

Expected file:

```text
data/reports/discrepancies.json
```

Verify:

```bash
cat data/reports/discrepancies.json
```

Empty array is valid:

```json
[]
```

If Gemini quota is exhausted, the command now exits gracefully and writes whatever result it can.

### Phase 9: Generate Reports

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

Verify:

```bash
node -e "const r=require('./data/reports/report.json'); console.log(r.overall);"
```

Expected example:

```js
{
  status: 'PASS',
  compliance_score: 100,
  pages_reviewed: 11,
  total_checks: 593,
  passed_checks: 593,
  failed_checks: 0,
  violations_count: 0
}
```

### Phase 10: Q&A Agent

List example questions:

```bash
npm run ask:examples
```

Ask questions:

```bash
npm run ask -- "Which pages violate the documentation?"
npm run ask -- "Show all failed checks."
npm run ask -- "Show evidence for each discrepancy."
npm run ask -- "List all UI discrepancies found on the My Applications dashboard."
npm run ask -- "Is the support contact information on the live site correct according to the manual?"
npm run ask -- "Does the live landing page match the official guidelines?"
```

Expected answer format:

```text
Question: ...

Answer...

Confidence: high

Guideline citations:
- ...

Page citations:
- ...

Screenshot evidence:
- ...
```

## 8. API Testing Commands

Health:

```bash
curl -s http://localhost:3000/health
```

Ask examples:

```bash
curl -s http://localhost:3000/api/ask/examples
```

Ask question:

```bash
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Show all failed checks."}'
```

Report JSON:

```bash
curl -s -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"format":"json"}'
```

## 9. Final Verification Summary Command

```bash
node -e "const out={pages:require('./data/ui/pages.json').length, components:require('./data/ui/components.json').length, rules:require('./data/guidelines/rules.json').length, summaries:require('./data/summaries/website-summaries.json').length, discrepancies:require('./data/reports/discrepancies.json').length, report:require('./data/reports/report.json').overall}; console.log(JSON.stringify(out,null,2));"
```

Expected example from the successful run:

```json
{
  "pages": 12,
  "components": 593,
  "rules": 85,
  "summaries": 11,
  "discrepancies": 0,
  "report": {
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

## 10. Common Errors And Fixes

### `chroma: error ... stat .../run: no such file or directory`

You are using the wrong `/usr/bin/chroma`.

Fix:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```

### `Failed to connect to chromadb`

Start ChromaDB:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```

Verify:

```bash
curl -s http://localhost:8000/api/v2/heartbeat
```

### `Cannot find package dotenv`

Install dependencies:

```bash
npm install --legacy-peer-deps
```

### `GEMINI_API_KEY is required`

Add key to `.env`:

```env
GEMINI_API_KEY=your_real_key
```

### Gemini quota errors

Example:

```text
429 Too Many Requests
Quota exceeded
```

Fix:

- wait for quota reset
- use another valid Gemini API key/project
- enable billing/increase quota

### Embedding model `text-embedding-004` not found

Use:

```env
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
```

### `localhost:3000/` shows route not found

Normal. Use:

```text
http://localhost:3000/health
```

### Playwright login fails

Set:

```env
HEADLESS=false
```

Then run:

```bash
npm run auth
```

Inspect screenshots:

```bash
ls screenshots/auth-*.png
```

## 11. Full One-By-One Execution Order

Use this order for a complete run:

```bash
npm run auth
npm run crawl:pages
npm run extract:components
npm run ingest
npm run index:guidelines
npm run summarize:website
npm run index:website
npm run compare
npm run report
npm run ask:examples
npm run ask -- "Show all failed checks."
```

## 12. Notes From Actual Successful Run

Actual successful run produced:

```text
Pages crawled: 12
Components extracted: 593
Website summaries: 11
Discrepancies: 0
Report status: PASS
Compliance score: 100
```

Known limitation:

```text
The authenticated dashboard pages were captured successfully.
The public landing page `/` was not captured as canonical components in the main Phase 3/4 artifact set.
So landing-page Q&A may correctly answer with low confidence or insufficient evidence.
```
