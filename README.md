# AI Documentation Compliance Agent

## Prerequisites

- Node.js 20 or newer
- npm
- Python 3.12 (recommended for ChromaDB on Windows)
- A Gemini API key
- Microsoft Visual C++ Redistributable x64 (Windows only)

Windows users can download the Visual C++ runtime from:

<https://aka.ms/vc14/vc_redist.x64.exe>

## How To Run The Project

### 1. Open the Project Folder

Run the commands below from the repository root. For example:

```bash
cd "/path/to/AI Compliance Checker Aagent"
```

On Windows, Git Bash accepts paths such as:

```bash
cd "/d/AI Compliance Checker Aagent"
```

### 2. Install Node.js Dependencies

Git Bash, Linux, or macOS:

```bash
npm install --legacy-peer-deps
npx playwright install chromium
npm install --prefix client --legacy-peer-deps
```

PowerShell:

```powershell
npm.cmd install --legacy-peer-deps
npx.cmd playwright install chromium
npm.cmd install --prefix client --legacy-peer-deps
```

If PowerShell reports that `npm.ps1` cannot be loaded because scripts are
disabled, either use `npm.cmd` as shown above or run this once in PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Restart the terminal afterward.

If the frontend reports that `vite` is not recognized, reinstall its
dependencies:

```bash
rm -rf client/node_modules
npm install --prefix client --legacy-peer-deps
```

### 3. Create `.env`

Git Bash, Linux, or macOS:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
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
GUIDELINES_PDF_PATH=/absolute/path/to/WaiverPro-User-Guidelines.pdf
HEADLESS=true
```

On Windows, an absolute PDF path can use forward slashes:

```env
GUIDELINES_PDF_PATH=D:/Documents/WaiverPro-User-Guidelines.pdf
```

### 4. Start ChromaDB

Create the ChromaDB virtual environment once.

Linux or macOS:

```bash
python3 -m venv .venv-chroma
source .venv-chroma/bin/activate
python -m pip install --upgrade pip
python -m pip install chromadb
```

Windows Git Bash:

```bash
py -3.12 -m venv .venv-chroma
source .venv-chroma/Scripts/activate
python -m pip install --upgrade pip
python -m pip install chromadb
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv-chroma
.\.venv-chroma\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install chromadb
```

Confirm that the environment uses Python 3.12:

```bash
python --version
```

Then start ChromaDB in a dedicated terminal and keep it running.

Linux or macOS:

```bash
source .venv-chroma/bin/activate
chroma run --host localhost --port 8000
```

Windows Git Bash:

```bash
source .venv-chroma/Scripts/activate
chroma run --host localhost --port 8000
```

Windows PowerShell:

```powershell
.\.venv-chroma\Scripts\Activate.ps1
chroma run --host localhost --port 8000
```

Verify ChromaDB:

```bash
curl http://localhost:8000/api/v2/heartbeat
```

### 5. Start Backend

Open another terminal:

```bash
npm run start
```

Verify backend:

```bash
curl -s http://localhost:3000/health
```

If port `3000` is already busy:

Linux or macOS:

```bash
npm run start:3001
```

Windows Git Bash:

```bash
PORT=3001 node src/index.js
```

Windows PowerShell:

```powershell
$env:PORT="3001"
node src/index.js
```

### 6. Start Frontend

Open another terminal:

```bash
npm run client:dev
```

Open in browser:

```text
http://localhost:5173
```

If backend is running on `3001`, start frontend like this:

Linux or macOS:

```bash
npm run client:dev:3001
```

Windows Git Bash:

```bash
VITE_BACKEND_TARGET=http://localhost:3001 npm run dev --prefix client
```

Windows PowerShell:

```powershell
$env:VITE_BACKEND_TARGET="http://localhost:3001"
npm.cmd run dev --prefix client
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

Linux or macOS:

```bash
npm run pipeline:evaluate
```

Windows Git Bash:

```bash
RULE_EXTRACTION_MODE=deterministic WEBSITE_SUMMARY_MODE=deterministic REUSE_WEBSITE_SUMMARIES=true COMPLIANCE_MAX_RULES=25 node src/cli.js pipeline:evaluate
```

Windows PowerShell:

```powershell
$env:RULE_EXTRACTION_MODE="deterministic"
$env:WEBSITE_SUMMARY_MODE="deterministic"
$env:REUSE_WEBSITE_SUMMARIES="true"
$env:COMPLIANCE_MAX_RULES="25"
node src/cli.js pipeline:evaluate
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

Use the fast evaluation command for your operating system in
[Run From Terminal](#8-run-from-terminal).

If Windows reports `DLL load failed while importing chromadb_rust_bindings`:

1. Confirm `python --version` reports Python 3.12.
2. Install or repair the Microsoft Visual C++ Redistributable x64:
   <https://aka.ms/vc14/vc_redist.x64.exe>
3. Restart VS Code or the terminal, reactivate `.venv-chroma`, and run Chroma
   again.

Windows virtual environments use `Scripts`; Linux and macOS virtual
environments use `bin`. Do not use `.venv-chroma/bin/chroma` on Windows.

PowerShell 5 does not support Bash commands such as `test -d ...` or `&&`.
Run those commands in Git Bash, or use the PowerShell equivalent:

```powershell
Test-Path node_modules
```
