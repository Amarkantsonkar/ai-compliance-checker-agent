# AI Documentation Compliance Agent

Foundation for an AI agent that checks the live WaiverPro provider portal against the official WaiverPro user guidelines PDF.

## Stack

- Node.js with JavaScript ES Modules
- Express.js API
- Playwright for rendered UI extraction and screenshots
- Google Gemini API with `gemini-2.5-flash`
- LangChain JS
- ChromaDB with Gemini `text-embedding-004`
- `pdf-parse` for guideline ingestion

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Fill `GEMINI_API_KEY` in `.env`.

Start ChromaDB separately, for example:

```bash
chroma run --host localhost --port 8000
```

## Commands

```bash
npm run auth
npm run ingest
npm run index:guidelines
npm run summarize
npm run crawl:pages
npm run extract:components
npm run summarize:website
npm run index:website
npm run crawl
npm run compare
npm run report
npm run ask:examples
```

Or run the end-to-end pipeline:

```bash
npm run pipeline
```

Ask compliance questions after ingestion/indexing:

```bash
npm run ask -- "Does the live landing page match the official guidelines?"
```

Start the API:

```bash
npm run start
```

API endpoints:

- `GET /health`
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
- `POST /api/ask` with `{ "question": "..." }`
- `GET /api/ask/examples`
- `GET /api/artifacts/summary`
- `GET /api/artifacts/pages`
- `GET /api/artifacts/components`
- `GET /api/artifacts/rules`
- `GET /api/artifacts/summaries`
- `GET /api/artifacts/discrepancies`
- `GET /api/artifacts/report`

## Frontend

The React frontend lives in `client/` and uses JavaScript, Vite, Tailwind CSS, and `lucide-react`.

Install frontend dependencies:

```bash
npm install --prefix client
```

Start the backend in one terminal:

```bash
npm run start
```

Start the frontend in another terminal:

```bash
npm run client:dev
```

If port `3000` already has an older backend running, use:

```bash
npm run start:3001
npm run client:dev:3001
```

Open:

```text
http://localhost:5173
```

Build the frontend:

```bash
npm run client:build
```

The frontend reads generated artifacts from `/api/artifacts/*`, triggers pipeline stages through existing API routes, and displays screenshot evidence through `/screenshots/*`.

## Outputs

- `data/guidelines/waiverpro-guidelines.raw.txt`
- `data/guidelines/guideline-pages.json`
- `data/guidelines/guideline-chunks.json`
- `data/guidelines/rules.json`
- `data/guidelines/guideline-rules.json`
- `data/session/auth-storage-state.json`
- `data/ui/pages.json`
- `data/ui/components.json`
- `data/ui/coverage.json`
- `data/ui/crawl-failures.json`
- `data/ui/discovered-routes.json`
- `data/ui/ui-states.json`
- `data/summaries/website-summaries.json`
- `data/summaries/website-*.md`
- `screenshots/*.png`
- `data/reports/discrepancies.json`
- `data/reports/coverage.json`
- `data/reports/report.json`
- `data/reports/report.md`
- `data/reports/final-report.md`

## Architecture

The pipeline is intentionally staged:

1. Ingest and parse the official PDF into durable text chunks.
2. Extract checkable guideline rules with Gemini 2.5 Flash.
3. Embed guideline chunks with `text-embedding-004` and store them in ChromaDB.
4. Use Playwright to capture rendered, authenticated UI pages, components, and screenshots.
5. Summarize extracted website evidence and embed it into ChromaDB.
6. Retrieve relevant guideline and website context per rule.
7. Ask Gemini to compare only retrieved guidelines and supplied UI evidence.
8. Write JSON and Markdown reports with citations and screenshot links.

## Phase 2 Authentication

The Playwright authentication module lives in `src/crawler/auth.js` and exports:

- `login(page)`
- `saveSession(context)`
- `loadSession()`
- `verifyAuthentication(page)`

Run it directly with:

```bash
npm run auth
```

Successful authentication writes Playwright storage state to `data/session/auth-storage-state.json`. Later runs try to load that session first, verify the dashboard is still authenticated, and fall back to a fresh login if the saved session expired.

## Phase 3 Website Crawler

Run only the authenticated website crawler:

```bash
npm run crawl:pages
```

The crawler reuses `data/session/auth-storage-state.json` when available, discovers same-origin routes from the authenticated app, handles SPA navigation by inspecting links and clicking visible navigation controls, waits for network idle, retries page failures three times, captures screenshots, and avoids duplicate crawls with normalized route tracking.

Outputs:

- `data/ui/pages.json`
- `data/ui/coverage.json`
- `data/ui/crawl-failures.json`
- `screenshots/*.png`

## Phase 4 Canonical UI Extraction

Run the component extraction engine:

```bash
npm run extract:components
```

The extractor uses the authenticated Playwright session, reads `data/ui/pages.json`, visits each crawled page, waits for the rendered SPA state, and extracts visible canonical components using DOM APIs.

Supported component types:

- `heading`
- `button`
- `link`
- `navigation_item`
- `text_block`
- `input`
- `table`
- `card`
- `modal`

Output:

- `data/ui/components.json`

## Phase 5 PDF Parsing & Rule Extraction

Run PDF parsing and Gemini rule extraction:

```bash
npm run ingest
```

The parser uses `pdf-parse` with a custom page renderer to preserve page numbers, headings, sections, and paragraph blocks. It validates malformed PDFs before parsing, logs failures, and writes page-aware intermediate artifacts.

Rule output schema:

```json
{
  "section": "Section 2: Accessing WaiverPro",
  "subsection": "Key elements of the landing page",
  "guideline_text": "The landing page must include a Getting Started button in the top-right corner.",
  "source_page": 4
}
```

Outputs:

- `data/guidelines/waiverpro-guidelines.raw.txt`
- `data/guidelines/guideline-pages.json`
- `data/guidelines/guideline-chunks.json`
- `data/guidelines/rules.json`

## Phase 6 ChromaDB + Gemini Embeddings

The vector database layer uses ChromaDB collections embedded with Gemini `text-embedding-004`.

Collections:

- `guidelines_collection`
- `website_collection`

Reusable service methods:

- `addDocuments()`
- `searchDocuments()`
- `deleteDocuments()`

Index guideline chunks:

```bash
npm run index:guidelines
```

Index website summaries from `data/ui/pages.json` and `data/ui/components.json`:

```bash
npm run index:website
```

Search through the API:

```http
POST /api/vector/search
Content-Type: application/json

{
  "collectionName": "guidelines_collection",
  "query": "landing page Getting Started button",
  "limit": 5
}
```

Delete by ids:

```http
POST /api/vector/delete
Content-Type: application/json

{
  "collectionName": "website_collection",
  "ids": ["website-page-%2Fdashboard"]
}
```

## Phase 7 Website Summarization

Generate semantic summaries from extracted UI components:

```bash
npm run summarize:website
```

Input:

- `data/ui/components.json`
- `data/ui/pages.json`

Outputs:

- `data/summaries/website-summaries.json`
- `data/summaries/website-*.md`

The summarizer uses Gemini 2.5 Flash to describe each page semantically, including important buttons, inputs, tables, filters, navigation items, and likely workflows. It then embeds the generated summaries with `text-embedding-004` and stores them in ChromaDB `website_collection`.

API:

```http
POST /api/summarize/website
Content-Type: application/json

{
  "index": true
}
```

## Phase 8 Compliance Agent

Run the RAG-backed compliance comparison:

```bash
npm run compare
```

Inputs:

- `data/guidelines/rules.json`
- `data/ui/components.json`
- `data/summaries/website-summaries.json`
- ChromaDB `guidelines_collection`
- ChromaDB `website_collection`

Output:

- `data/reports/discrepancies.json`

Discrepancy schema:

```json
{
  "page_url": "/dashboard",
  "guideline_reference": "Section 2: Accessing WaiverPro > Key elements > Page 4",
  "expected_text_content": "The dashboard must include a Create Application button.",
  "actual_text_content": "Not found in supplied UI evidence",
  "discrepancy_flag": true,
  "discrepancy_reason": "The retrieved guideline requires the button, but the supplied dashboard components and summary do not show it.",
  "screenshot_path": "screenshots/dashboard.png",
  "retrieved_at": "2026-06-17T00:00:00.000Z"
}
```

The agent uses Gemini 2.5 Flash with ChromaDB retrieval from both guideline and website collections. It is intentionally conservative: if retrieved evidence is ambiguous, missing, unrelated, or compliant, it writes no discrepancy instead of guessing.

## Phase 9 Report Generator

Generate auditor-friendly compliance reports from discrepancy records:

```bash
npm run report
```

Input:

- `data/reports/discrepancies.json`
- `data/ui/components.json`
- `data/summaries/website-summaries.json`
- `data/reports/coverage.json`

Outputs:

- `data/reports/report.json`
- `data/reports/report.md`
- `data/reports/final-report.md`

The JSON report includes:

- overall compliance score
- page-wise compliance scores
- violations
- guideline references
- screenshot evidence
- mismatch explanations

API:

```http
POST /api/report
Content-Type: application/json

{
  "format": "json"
}
```

## Phase 10 Compliance Q&A Agent

List supported example questions:

```bash
npm run ask:examples
```

Ask a compliance question:

```bash
npm run ask -- "Does the live landing page match the official guidelines?"
```

Questions this agent is designed to answer:

- Does the live landing page match the official guidelines?
- List all UI discrepancies found on the My Applications dashboard.
- Is the support contact information on the live site correct according to the manual?
- Which pages violate the documentation?
- Show all failed checks.
- Show evidence for each discrepancy.

The Q&A agent uses Gemini 2.5 Flash with ChromaDB retrieval from:

- `guidelines_collection`
- `website_collection`

It also grounds answers in local artifacts:

- `data/reports/discrepancies.json`
- `data/reports/report.json`
- `data/ui/components.json`
- `data/summaries/website-summaries.json`

API:

```http
GET /api/ask/examples
```

```http
POST /api/ask
Content-Type: application/json

{
  "question": "Show evidence for each discrepancy."
}
```

Response shape:

```json
{
  "question": "Show evidence for each discrepancy.",
  "answer": "Evidence-grounded answer with the automated-check disclaimer.",
  "confidence": "high",
  "citations": {
    "guideline_sections": ["Section 3.2 > Page 8"],
    "page_urls": ["/dashboard"],
    "screenshots": ["screenshots/dashboard.png"]
  },
  "failed_checks": [
    {
      "page_url": "/dashboard",
      "expected": "New Application",
      "actual": "Create Application",
      "reference": "Section 3.2",
      "screenshot": "screenshots/dashboard.png",
      "explanation": "The visible button label differs from the manual."
    }
  ],
  "limitations": [],
  "evidence_counts": {
    "guideline_context": 8,
    "website_context": 8,
    "discrepancies": 1,
    "components": 20,
    "summaries": 1
  }
}
```

The agent is intentionally conservative: if retrieved evidence is insufficient, it says so instead of inventing an answer.

## Tooling Decisions

Playwright is used because the assignment requires rendered UI states after JavaScript execution and authentication. Raw HTML scraping would miss dynamic content and route-specific state.

ChromaDB plus Gemini embeddings provide a small local RAG layer so the comparison agent cites guideline sections instead of relying on model memory.

The system keeps JSON artifacts between stages for debuggability, repeatability, and partial progress. A failed crawl or comparison can be inspected without rerunning every previous step.

## Known Limitations

- Deep workflows that create, edit, or delete real data need explicit scripted flows before they should run automatically.
- The crawler discovers visible links and seed dashboard routes; hidden modal states and guided tours may need targeted extraction scripts.
- Visual analysis is currently based on screenshots plus DOM evidence. Pixel-level layout checks can be added for stable high-risk screens.
- This is an automated compliance check, not a replacement for manual QA.
















































































