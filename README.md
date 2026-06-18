# AI Documentation Compliance Agent

AI-powered compliance checker for comparing the live WaiverPro provider portal against the official WaiverPro user guidelines PDF.

The project crawls the authenticated website, extracts canonical UI components, parses guideline rules from the PDF, stores guideline and website evidence in ChromaDB, runs Gemini-based compliance comparison, generates reports, and provides a React dashboard for review.

## Tech Stack

- Node.js with JavaScript ES Modules
- Express.js backend API
- React.js frontend with Vite and Tailwind CSS
- Playwright for login, crawling, screenshots, and DOM extraction
- Google Gemini 2.5 Flash
- Gemini embedding model via `GEMINI_EMBEDDING_MODEL`
- LangChain JS
- ChromaDB
- `pdf-parse`

## Project Structure

```text
src/
  compliance/
  config/
  crawler/
  embeddings/
  middleware/
  parser/
  qa/
  reports/
  summarizer/
  utils/

client/
  src/
  package.json
  vite.config.js

data/
  guidelines/
  reports/
  session/
  summaries/
  ui/

screenshots/
```

## 1. Install Dependencies

Go to the project folder:

```bash
cd "/home/amar/Desktop/AI Compliance Checker Aagent"
```

Install backend dependencies:

```bash
npm install --legacy-peer-deps
```

Install Playwright Chromium:

```bash
npx playwright install chromium
```

Install frontend dependencies:

```bash
npm install --prefix client
```

Verify Node:

```bash
node --version
npm --version
```

Node should be version `20+`.

## 2. Configure Environment

Create `.env`:

```bash
cp .env.example .env
```

Required values:

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
RULE_EXTRACTION_DELAY_MS=15000
```

For visual Playwright debugging:

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

If you get `429 Too Many Requests`, the key is valid but quota is exhausted.

## 3. Start ChromaDB

Do not use system `/usr/bin/chroma` if it behaves like a Go syntax highlighter. Use the local ChromaDB virtual environment:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```

Keep that terminal open.

Verify in another terminal:

```bash
curl -s http://localhost:8000/api/v2/heartbeat
```

Expected shape:

```json
{"nanosecond heartbeat":123456789}
```

If `.venv-chroma` does not exist:

```bash
python3 -m venv .venv-chroma
.venv-chroma/bin/pip install chromadb
.venv-chroma/bin/chroma run --host localhost --port 8000
```

## 4. Start Backend API

```bash
npm run start
```

Verify:

```bash
curl -s http://localhost:3000/health
```

Expected:

```json
{"status":"ok","service":"ai-documentation-compliance-agent","timestamp":"..."}
```

Note: `http://localhost:3000/` returning route-not-found is normal. Use `/health` or `/api/*`.

If port `3000` is already in use:

```bash
npm run start:3001
```

## 5. Start Frontend

In another terminal:

```bash
npm run client:dev
```

Open:

```text
http://localhost:5173
```

If backend is running on `3001`:

```bash
npm run client:dev:3001
```

Build frontend:

```bash
npm run client:build
```

The UI displays:

- compliance score
- crawled pages
- extracted components
- guideline rules
- discrepancies
- reports
- screenshot evidence
- Q&A panel
- full validation pipeline button

## 6. Syntax Check

```bash
for file in src/**/*.js src/*.js; do node --check "$file" || exit 1; done
```

Expected: no output.

## 7. Full Execution Order

Run commands from the project folder in this order:

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

## 8. Phase Verification

### Phase 2: Authentication

```bash
npm run auth
```

Expected session file:

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

If screenshots already exist, the crawler can skip and return:

```text
Screenshots already exist for this PDF.
```

### Phase 4: Extract UI Components

```bash
npm run extract:components
```

Verify:

```bash
node -e "const c=require('./data/ui/components.json'); console.log(c.length); console.log(c[0]);"
```

Expected component shape:

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

Useful rules check:

```bash
node -e "const r=require('./data/guidelines/rules.json'); const useful=r.filter(x => x.section !== 'Unknown section' && x.source_page > 2); console.log(useful.length); console.log(useful.slice(0,10));"
```

### Phase 6: Index Guidelines In ChromaDB

```bash
npm run index:guidelines
```

Test retrieval:

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

Test retrieval:

```bash
curl -s -X POST http://localhost:3000/api/vector/search \
  -H "Content-Type: application/json" \
  -d '{"collectionName":"website_collection","query":"my applications dashboard new application","limit":2}'
```

Expected: JSON with `results`.

### Phase 8: Compliance Comparison

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

An empty array is valid:

```json
[]
```

If Gemini quota is exhausted, the command exits gracefully and writes whatever result it can.

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

### Phase 10: Q&A Agent

```bash
npm run ask:examples
```

Ask:

```bash
npm run ask -- "Which pages violate the documentation?"
npm run ask -- "Show all failed checks."
npm run ask -- "Show evidence for each discrepancy."
npm run ask -- "List all UI discrepancies found on the My Applications dashboard."
npm run ask -- "Is the support contact information on the live site correct according to the manual?"
npm run ask -- "Does the live landing page match the official guidelines?"
```

The Q&A agent answers report/discrepancy questions deterministically from `report.json` and `discrepancies.json` first. If local report evidence is not enough, it falls back to Gemini plus ChromaDB retrieval.

## 9. API Endpoints

- `GET /health`
- `GET /api/ask/examples`
- `GET /api/artifacts/summary`
- `GET /api/artifacts/pages`
- `GET /api/artifacts/components`
- `GET /api/artifacts/rules`
- `GET /api/artifacts/summaries`
- `GET /api/artifacts/discrepancies`
- `GET /api/artifacts/report`
- `POST /api/ingest`
- `POST /api/index`
- `POST /api/index/website`
- `POST /api/vector/search`
- `POST /api/vector/delete`
- `POST /api/summarize`
- `POST /api/summarize/website`
- `POST /api/crawl`
- `POST /api/crawl/pages`
- `POST /api/extract/components`
- `POST /api/compare`
- `POST /api/report`
- `POST /api/ask`

Example Q&A API call:

```bash
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Show all failed checks."}'
```

Example report call:

```bash
curl -s -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"format":"json"}'
```

## 10. Final Verification

```bash
node -e "const out={pages:require('./data/ui/pages.json').length, components:require('./data/ui/components.json').length, rules:require('./data/guidelines/rules.json').length, summaries:require('./data/summaries/website-summaries.json').length, discrepancies:require('./data/reports/discrepancies.json').length, report:require('./data/reports/report.json').overall}; console.log(JSON.stringify(out,null,2));"
```

Expected shape:

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

Counts can vary depending on crawl timing, generated data, and Gemini quota.

## 11. Common Errors And Fixes

### `chroma: error ... stat .../run: no such file or directory`

You are using the wrong system `chroma`.

Fix:

```bash
.venv-chroma/bin/chroma run --host localhost --port 8000
```

### `Address localhost:8000 is not available`

ChromaDB is already running on port `8000`.

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

Add a valid key to `.env`:

```env
GEMINI_API_KEY=your_real_key
```

### Gemini `429 Too Many Requests`

The key works, but quota is exhausted.

Fix options:

- wait for quota reset
- use another valid Gemini API key/project
- enable billing or increase quota
- keep `RULE_EXTRACTION_DELAY_MS=15000`

### Embedding model not found

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

Inspect:

```bash
ls screenshots/auth-*.png
```

## 12. Notes

Actual successful runs have produced approximately:

```text
Pages crawled: 12
Components extracted: 593+
Website summaries: 11
Report status: PASS
Compliance score: 100
```

Known limitation:

```text
Authenticated dashboard pages are captured successfully.
The public landing page may not always be represented in the canonical authenticated artifact set.
Landing-page Q&A can therefore return low confidence or insufficient evidence.
```
