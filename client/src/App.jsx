import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  FileText,
  Gauge,
  Image,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Table2,
  X
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const navItems = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "pages", label: "Pages", icon: Image },
  { id: "components", label: "Components", icon: Layers3 },
  { id: "guidelines", label: "Guidelines", icon: FileText },
  { id: "discrepancies", label: "Discrepancies", icon: AlertTriangle },
  { id: "report", label: "Report", icon: ClipboardCheck },
  { id: "qa", label: "Q&A", icon: FileQuestion },
  { id: "settings", label: "Settings", icon: Settings }
];

const pipelineActions = [
  { id: "crawl", label: "Crawl Pages", path: "/api/crawl/pages", icon: Image },
  { id: "extract", label: "Extract UI", path: "/api/extract/components", icon: Layers3 },
  { id: "ingest", label: "Parse PDF", path: "/api/ingest", icon: FileText },
  { id: "indexGuidelines", label: "Index Guidelines", path: "/api/index", icon: Server },
  { id: "summarizeWebsite", label: "Summarize Website", path: "/api/summarize/website", icon: BarChart3 },
  { id: "indexWebsite", label: "Index Website", path: "/api/index/website", icon: Server },
  { id: "compare", label: "Compare", path: "/api/compare", icon: ShieldCheck },
  { id: "report", label: "Generate Report", path: "/api/report", body: { format: "json" }, icon: ClipboardCheck }
];

const statusStyles = {
  PASS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAIL: "bg-red-50 text-red-700 ring-red-200",
  WARNING: "bg-amber-50 text-amber-800 ring-amber-200"
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? tryJson(text) : {};
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Request failed: ${response.status}`);
  }
  return data;
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { markdown: text };
  }
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0";
}

function shortPath(value) {
  if (!value) return "Not available";
  return String(value).replace("/home/amar/Desktop/AI Compliance Checker Aagent/", "");
}

function summarizeResult(result) {
  if (!result) return "Completed";
  if (result.message) return result.message;
  if (typeof result === "string") return result;
  const entries = Object.entries(result)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
  return entries.length ? entries.join(", ") : "Completed";
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700 ring-stone-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    danger: "bg-red-50 text-red-700 ring-red-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    info: "bg-cyan-50 text-cyan-800 ring-cyan-200"
  };
  return <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

function Panel({ title, action, children }) {
  return (
    <section className="border border-stone-200 bg-white">
      <div className="flex min-h-14 items-center justify-between border-b border-stone-200 px-4">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, icon: Icon, tone = "neutral", helper }) {
  const iconStyles = {
    neutral: "bg-stone-100 text-stone-700",
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-cyan-100 text-cyan-800"
  };
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
          {helper ? <p className="mt-1 text-xs text-stone-500">{helper}</p> : null}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded ${iconStyles[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Table({ columns, rows, emptyText = "No records found" }) {
  return (
    <div className="overflow-x-auto border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row.id || `${row.page_url || row.section || "row"}-${index}`} className="align-top">
                {columns.map((column) => (
                  <td key={column.key} className="max-w-[420px] px-3 py-3 text-stone-700">
                    {column.render ? column.render(row, index) : row[column.key] || "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-8 text-center text-stone-500" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalImage, setModalImage] = useState(null);
  const [actionState, setActionState] = useState({});
  const [fullPipelineRunning, setFullPipelineRunning] = useState(false);
  const [qaQuestion, setQaQuestion] = useState("Which pages violate the documentation?");
  const [qaAnswer, setQaAnswer] = useState(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [data, setData] = useState({
    summary: null,
    pages: [],
    components: [],
    rules: [],
    summaries: [],
    discrepancies: [],
    report: null,
    markdown: "",
    examples: []
  });

  const loadArtifacts = async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, pages, components, rules, summaries, discrepancies, report, examples] = await Promise.all([
        api("/api/artifacts/summary"),
        api("/api/artifacts/pages"),
        api("/api/artifacts/components"),
        api("/api/artifacts/rules"),
        api("/api/artifacts/summaries"),
        api("/api/artifacts/discrepancies"),
        api("/api/artifacts/report"),
        api("/api/ask/examples")
      ]);
      setData({
        summary,
        pages: pages.pages || [],
        components: components.components || [],
        rules: rules.rules || [],
        summaries: summaries.summaries || [],
        discrepancies: discrepancies.discrepancies || [],
        report: report.report,
        markdown: report.markdown || "",
        examples: examples.questions || []
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArtifacts();
  }, []);

  const runAction = async (action) => {
    setActionState((current) => ({ ...current, [action.id]: { loading: true, error: "", result: "" } }));
    try {
      const result = await api(action.path, { method: "POST", body: action.body || {} });
      setActionState((current) => ({ ...current, [action.id]: { loading: false, status: "completed", error: "", result } }));
      await loadArtifacts();
    } catch (err) {
      setActionState((current) => ({ ...current, [action.id]: { loading: false, status: "failed", error: err.message, result: "" } }));
    }
  };

  const runFullPipeline = async () => {
    setFullPipelineRunning(true);
    setActionState(
      pipelineActions.reduce((state, action) => {
        state[action.id] = { loading: false, status: "queued", error: "", result: "" };
        return state;
      }, {})
    );

    try {
      for (const action of pipelineActions) {
        setActionState((current) => ({
          ...current,
          [action.id]: { ...current[action.id], loading: true, status: "running", error: "", result: "" }
        }));
        const result = await api(action.path, { method: "POST", body: action.body || {} });
        setActionState((current) => ({
          ...current,
          [action.id]: { loading: false, status: "completed", error: "", result }
        }));
      }
      await loadArtifacts();
    } catch (err) {
      setActionState((current) => {
        const runningEntry = pipelineActions.find((action) => current[action.id]?.status === "running");
        if (!runningEntry) return current;
        return {
          ...current,
          [runningEntry.id]: {
            ...current[runningEntry.id],
            loading: false,
            status: "failed",
            error: err.message,
            result: ""
          }
        };
      });
    } finally {
      setFullPipelineRunning(false);
    }
  };

  const askQuestion = async (question = qaQuestion) => {
    if (!question.trim()) return;
    setQaLoading(true);
    setQaAnswer(null);
    try {
      const answer = await api("/api/ask", { method: "POST", body: { question } });
      setQaAnswer(answer);
    } catch (err) {
      setQaAnswer({ answer: err.message, citations: [] });
    } finally {
      setQaLoading(false);
    }
  };

  const overall = data.report?.overall || data.summary?.report_overall || {};
  const status = overall.status || "PENDING";
  const statusTone = status === "FAIL" ? "danger" : status === "PASS" ? "success" : "warning";

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-stone-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-stone-200 bg-white lg:block">
          <div className="border-b border-stone-200 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-cyan-800 text-white">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Compliance</p>
                <p className="text-xs text-stone-500">WaiverPro auditor</p>
              </div>
            </div>
          </div>
          <nav className="p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = active === item.id;
              return (
                <button
                  key={item.id}
                  className={`mb-1 flex h-10 w-full items-center gap-3 rounded px-3 text-left text-sm ${
                    selected ? "bg-cyan-50 font-medium text-cyan-900" : "text-stone-600 hover:bg-stone-100"
                  }`}
                  onClick={() => setActive(item.id)}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-lg font-semibold">Documentation Compliance Console</h1>
                <p className="text-sm text-stone-500">PDF rules, live UI evidence, reports, and audit Q&A</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
                  onClick={loadArtifacts}
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  Refresh
                </button>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`h-9 shrink-0 rounded px-3 text-sm ${active === item.id ? "bg-cyan-800 text-white" : "bg-stone-100 text-stone-700"}`}
                  onClick={() => setActive(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          {error ? (
            <div className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex-1 p-4">
            {loading ? <LoadingState /> : null}
            {!loading && active === "overview" ? (
              <Overview
                data={data}
                overall={overall}
                status={status}
                statusTone={statusTone}
                actionState={actionState}
                runAction={runAction}
                runFullPipeline={runFullPipeline}
                fullPipelineRunning={fullPipelineRunning}
                setActive={setActive}
              />
            ) : null}
            {!loading && active === "pages" ? <PagesView pages={data.pages} onImage={setModalImage} /> : null}
            {!loading && active === "components" ? <ComponentsView components={data.components} onImage={setModalImage} /> : null}
            {!loading && active === "guidelines" ? <GuidelinesView rules={data.rules} /> : null}
            {!loading && active === "discrepancies" ? <DiscrepanciesView discrepancies={data.discrepancies} onImage={setModalImage} /> : null}
            {!loading && active === "report" ? <ReportView report={data.report} markdown={data.markdown} onImage={setModalImage} /> : null}
            {!loading && active === "qa" ? (
              <QaView
                examples={data.examples}
                question={qaQuestion}
                setQuestion={setQaQuestion}
                answer={qaAnswer}
                loading={qaLoading}
                askQuestion={askQuestion}
              />
            ) : null}
            {!loading && active === "settings" ? <SettingsView summary={data.summary} /> : null}
          </div>
        </main>
      </div>

      {modalImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <p className="truncate text-sm font-medium text-stone-700">{modalImage.label}</p>
              <button className="rounded p-2 text-stone-500 hover:bg-stone-100" onClick={() => setModalImage(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-stone-100 p-3">
              <img src={modalImage.url} alt={modalImage.label} className="mx-auto max-w-full border border-stone-200 bg-white" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-stone-500">
        <Loader2 className="animate-spin" size={18} />
        Loading compliance artifacts
      </div>
    </div>
  );
}

function Overview({ data, overall, status, statusTone, actionState, runAction, runFullPipeline, fullPipelineRunning, setActive }) {
  const counts = data.summary?.counts || {};
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Stat label="Overall Score" value={`${overall.compliance_score ?? 0}%`} icon={Gauge} tone={statusTone} helper={status} />
        <Stat label="Pages" value={formatNumber(counts.pages)} icon={Image} tone="info" />
        <Stat label="Components" value={formatNumber(counts.components)} icon={Layers3} tone="neutral" />
        <Stat label="Rules" value={formatNumber(counts.rules)} icon={FileText} tone="neutral" />
        <Stat label="Discrepancies" value={formatNumber(counts.discrepancies)} icon={AlertTriangle} tone={counts.discrepancies ? "danger" : "success"} />
        <Stat label="Screenshots" value={formatNumber(counts.screenshots)} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Pipeline Actions"
          action={
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded bg-cyan-800 px-3 text-sm font-medium text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={runFullPipeline}
              disabled={fullPipelineRunning}
            >
              {fullPipelineRunning ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              Run Full Validation
            </button>
          }
        >
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            {pipelineActions.map((action, index) => {
              const state = actionState[action.id] || {};
              const statusLabel = state.status || "ready";
              const tone =
                statusLabel === "completed"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : statusLabel === "failed"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : statusLabel === "running"
                      ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                      : statusLabel === "queued"
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-stone-200 bg-stone-50 text-stone-500";
              return (
                <div key={`step-${action.id}`} className={`border px-3 py-2 text-xs ${tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Step {index + 1}</span>
                    {statusLabel === "running" ? <Loader2 className="animate-spin" size={14} /> : null}
                  </div>
                  <p className="mt-1 truncate font-medium">{action.label}</p>
                  <p className="mt-1 capitalize">{statusLabel}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {pipelineActions.map((action) => {
              const Icon = action.icon;
              const state = actionState[action.id] || {};
              const statusText = state.error ? state.error : state.result ? summarizeResult(state.result) : state.status === "queued" ? "Queued" : "Ready";
              return (
                <button
                  key={action.id}
                  className="flex min-h-20 flex-col justify-between border border-stone-200 bg-stone-50 p-3 text-left hover:border-cyan-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={() => runAction(action)}
                  disabled={state.loading || fullPipelineRunning}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-stone-900">
                    {state.loading ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}
                    {action.label}
                  </span>
                  <span className={`mt-3 line-clamp-2 text-xs ${state.error ? "text-red-700" : "text-stone-500"}`}>{statusText}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Report Snapshot">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Status</span>
              <Badge tone={status === "FAIL" ? "danger" : status === "PASS" ? "success" : "warning"}>{status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Failed checks</span>
              <span className="font-medium">{formatNumber(overall.failed_checks)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Total checks</span>
              <span className="font-medium">{formatNumber(overall.total_checks)}</span>
            </div>
            <button className="mt-3 inline-flex h-9 w-full items-center justify-center rounded bg-cyan-800 px-3 text-sm font-medium text-white hover:bg-cyan-900" onClick={() => setActive("report")}>
              Open Report
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Latest Discrepancies">
        <DiscrepancyList discrepancies={data.discrepancies.slice(0, 4)} compact />
      </Panel>
    </div>
  );
}

function PagesView({ pages, onImage }) {
  return (
    <Panel title={`Pages (${pages.length})`}>
      <Table
        rows={pages}
        columns={[
          { key: "page_url", label: "Page URL", render: (row) => <span className="font-medium text-stone-900">{row.page_url}</span> },
          { key: "title", label: "Title" },
          { key: "crawled_at", label: "Crawled At", render: (row) => row.crawled_at || row.retrieved_at || "—" },
          {
            key: "screenshot",
            label: "Screenshot",
            render: (row) =>
              row.screenshot_url ? (
                <button className="inline-flex items-center gap-2 text-cyan-800 hover:underline" onClick={() => onImage({ url: row.screenshot_url, label: row.page_url })}>
                  <Image size={15} />
                  View
                </button>
              ) : (
                "—"
              )
          }
        ]}
      />
    </Panel>
  );
}

function ComponentsView({ components, onImage }) {
  const typeCounts = Object.entries(
    components.reduce((acc, item) => {
      acc[item.component_type] = (acc[item.component_type] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {typeCounts.map(([type, count]) => (
          <Badge key={type} tone="info">
            {type}: {count}
          </Badge>
        ))}
      </div>
      <Panel title={`Components (${components.length})`}>
        <Table
          rows={components}
          columns={[
            { key: "component_type", label: "Type", render: (row) => <Badge>{row.component_type}</Badge> },
            { key: "page_url", label: "Page" },
            { key: "component_selector", label: "Selector", render: (row) => <code className="text-xs text-cyan-900">{row.component_selector}</code> },
            { key: "actual_text_content", label: "Text", render: (row) => <span className="line-clamp-3">{row.actual_text_content || "—"}</span> },
            {
              key: "screenshot",
              label: "Evidence",
              render: (row) =>
                row.screenshot_url ? (
                  <button className="text-cyan-800 hover:underline" onClick={() => onImage({ url: row.screenshot_url, label: row.page_url })}>
                    Open
                  </button>
                ) : (
                  "—"
                )
            }
          ]}
        />
      </Panel>
    </div>
  );
}

function GuidelinesView({ rules }) {
  return (
    <Panel title={`Guideline Rules (${rules.length})`}>
      <Table
        rows={rules}
        columns={[
          { key: "section", label: "Section", render: (row) => <span className="font-medium">{row.section}</span> },
          { key: "subsection", label: "Subsection" },
          { key: "source_page", label: "Page", render: (row) => <Badge tone="neutral">Page {row.source_page}</Badge> },
          { key: "guideline_text", label: "Guideline", render: (row) => <span className="line-clamp-4">{row.guideline_text}</span> }
        ]}
      />
    </Panel>
  );
}

function DiscrepanciesView({ discrepancies, onImage }) {
  return (
    <Panel title={`Discrepancies (${discrepancies.length})`}>
      <DiscrepancyList discrepancies={discrepancies} onImage={onImage} />
    </Panel>
  );
}

function DiscrepancyList({ discrepancies, compact = false, onImage }) {
  if (!discrepancies.length) {
    return <div className="border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">No discrepancies found</div>;
  }
  return (
    <div className="space-y-3">
      {discrepancies.map((item, index) => (
        <article key={`${item.page_url}-${index}`} className="border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.discrepancy_flag === false ? "success" : "danger"}>{item.discrepancy_flag === false ? "PASS" : "FAIL"}</Badge>
                <span className="text-sm font-semibold text-stone-900">{item.page_url}</span>
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500">{item.guideline_reference}</p>
            </div>
            {item.screenshot_url && onImage ? (
              <button className="inline-flex items-center gap-2 text-sm font-medium text-cyan-800 hover:underline" onClick={() => onImage({ url: item.screenshot_url, label: item.page_url })}>
                <Image size={15} />
                Evidence
              </button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Expected</p>
              <p className="mt-1 text-sm text-stone-900">{item.expected_text_content || "—"}</p>
            </div>
            <div className="bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Actual</p>
              <p className="mt-1 text-sm text-stone-900">{item.actual_text_content || "—"}</p>
            </div>
          </div>
          {!compact ? <p className="mt-3 text-sm leading-6 text-stone-700">{item.discrepancy_reason}</p> : null}
        </article>
      ))}
    </div>
  );
}

function ReportView({ report, markdown, onImage }) {
  if (!report) {
    return <Panel title="Report"><div className="text-sm text-stone-500">Report not generated yet</div></Panel>;
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Compliance" value={`${report.overall?.compliance_score ?? 0}%`} icon={Gauge} tone={report.overall?.status === "FAIL" ? "danger" : "success"} helper={report.overall?.status} />
        <Stat label="Passed" value={formatNumber(report.overall?.passed_checks)} icon={CheckCircle2} tone="success" />
        <Stat label="Failed" value={formatNumber(report.overall?.failed_checks)} icon={AlertTriangle} tone={report.overall?.failed_checks ? "danger" : "success"} />
        <Stat label="Pages Reviewed" value={formatNumber(report.overall?.pages_reviewed)} icon={Image} tone="info" />
      </div>
      <Panel title="Page Scores">
        <Table
          rows={report.page_scores || []}
          columns={[
            { key: "page_url", label: "Page" },
            { key: "status", label: "Status", render: (row) => <span className={`rounded px-2 py-1 text-xs font-semibold ring-1 ${statusStyles[row.status] || statusStyles.WARNING}`}>{row.status}</span> },
            { key: "compliance_score", label: "Score", render: (row) => `${row.compliance_score}%` },
            { key: "checks", label: "Checks", render: (row) => `${row.checks?.passed ?? 0}/${row.checks?.total ?? 0} passed` },
            {
              key: "screenshot",
              label: "Evidence",
              render: (row) => {
                const url = row.screenshot_path ? `/screenshots/${row.screenshot_path.split("/screenshots/").pop()}` : null;
                return url ? (
                  <button className="text-cyan-800 hover:underline" onClick={() => onImage({ url, label: row.page_url })}>
                    Open
                  </button>
                ) : (
                  "—"
                );
              }
            }
          ]}
        />
      </Panel>
      <Panel title="Markdown Report">
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap bg-stone-950 p-4 text-xs leading-6 text-stone-100">{markdown || "No markdown report available"}</pre>
      </Panel>
    </div>
  );
}

function QaView({ examples, question, setQuestion, answer, loading, askQuestion }) {
  return (
    <div className="space-y-4">
      <Panel title="Compliance Q&A">
        <div className="flex flex-col gap-3 md:flex-row">
          <textarea
            className="min-h-24 flex-1 border border-stone-300 bg-white p-3 text-sm outline-none focus:border-cyan-700"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded bg-cyan-800 px-5 text-sm font-medium text-white hover:bg-cyan-900 disabled:opacity-70" onClick={() => askQuestion()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            Ask
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((item) => (
            <button key={item} className="rounded border border-stone-300 bg-stone-50 px-3 py-2 text-left text-xs text-stone-700 hover:border-cyan-700" onClick={() => {
              setQuestion(item);
              askQuestion(item);
            }}>
              {item}
            </button>
          ))}
        </div>
      </Panel>
      {answer ? (
        <Panel title="Answer">
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">{answer.answer || answer.response || "No answer returned"}</p>
            {answer.citations?.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Citations</p>
                <div className="space-y-2">
                  {answer.citations.map((citation, index) => (
                    <div key={`${citation.page_url || citation.guideline_reference}-${index}`} className="border border-stone-200 bg-stone-50 p-3 text-sm">
                      <p className="font-medium text-stone-900">{citation.guideline_reference || citation.section || "Evidence"}</p>
                      <p className="text-stone-600">{citation.page_url || citation.source || citation.screenshot_path || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function SettingsView({ summary }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Artifact Status">
        <div className="space-y-3 text-sm">
          {Object.entries(summary?.counts || {}).map(([key, value]) => (
            <div className="flex items-center justify-between border-b border-stone-100 pb-2" key={key}>
              <span className="capitalize text-stone-500">{key.replaceAll("_", " ")}</span>
              <span className="font-medium">{formatNumber(value)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Coverage">
        <pre className="overflow-auto bg-stone-950 p-4 text-xs leading-6 text-stone-100">{JSON.stringify(summary?.crawl_coverage || {}, null, 2)}</pre>
      </Panel>
    </div>
  );
}
