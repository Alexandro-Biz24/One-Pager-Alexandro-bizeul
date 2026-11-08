import { useEffect, useMemo, useState } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./StatisticalTestsSection.css";

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const METRICS = [
  ["mape", "\\text{MAPE}", 3],
  ["r2", "R^2", 3],
  ["coverage_95", "\\text{Coverage}", 2],
  ["mean_width", "\\text{Width}", 1],
  ["interval_failures", "\\text{Failures}", 2],
  ["ape_above_5", "\\text{APE}>5\\%", 2],
  ["mae", "\\text{MAE}", 1],
  ["rmse", "\\text{RMSE}", 1],
];

function fmt(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\\text{--}";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

function displayNumber(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatP(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\\text{--}";
  return Number(value) < 0.0001 ? "<0.0001" : Number(value).toFixed(4);
}

function formatHour(utc) {
  if (!utc) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(utc));
}

function Latex({ expression, block = false }) {
  const html = useMemo(() => katex.renderToString(expression, {
    displayMode: block, throwOnError: false, strict: "ignore",
  }), [expression, block]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function useStatistics(endpoint, model, mode, start, end) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (mode === "custom" && (!start || !end || end < start)) {
      setData(null); setLoading(false); setError("Invalid date range.");
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ model, period: mode });
    if (mode === "custom") { params.set("start", start); params.set("end", end); }
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/timeseries/statistics/${endpoint}?${params}`, {
          signal: controller.signal, headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Statistics API returned HTTP ${response.status}`);
        const json = await response.json();
        if (!controller.signal.aborted) setData(json);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || "Unable to load statistics.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [endpoint, model, mode, start, end]);
  return { data, loading, error };
}

function PerformanceTable({ summary }) {
  const latex = useMemo(() => {
    const rows = summary?.results ?? [];
    const header = ["\\text{Model}", ...METRICS.map((item) => item[1])].join(" & ");
    const names = ["\\text{RTE}", `\\text{${rows[1]?.model ?? "Model"}}`,
      "\\Delta_{\\mathrm{abs}}", "\\Delta_{\\mathrm{rel}}"];
    const body = names.map((name, i) => {
      const values = METRICS.map(([key, , digits]) => fmt(rows[i]?.[key], i === 3 ? 2 : digits));
      return [name, ...values].join(" & ");
    });
    return String.raw`\begin{array}{lrrrrrrrr}
\hline
${header} \\
\hline
${body.slice(0, 2).join(" \\\\ ")} \\
\hline
${body.slice(2).join(" \\\\ ")} \\
\hline
\end{array}`;
  }, [summary]);
  return <div className="statistical-tests-table-scroll">
    <div className="statistical-tests-latex"><Latex expression={latex} block /></div>
  </div>;
}

const METRIC_EXPLANATIONS = [
  ["MAPE — Mean absolute percentage error", String.raw`\mathrm{MAPE}=\frac{100}{N}\sum_t\frac{|y_t-\hat y_t|}{|y_t|}`, "Mean absolute percentage error. Lower is better; zero-valued observations are excluded."],
  ["R² — Coefficient of determination", String.raw`R^2=1-\frac{\sum_t(y_t-\hat y_t)^2}{\sum_t(y_t-\bar y)^2}`, "Higher is better. One corresponds to perfect forecasts."],
  ["95% coverage", String.raw`\mathrm{Coverage}=\frac{100}{N}\sum_t\mathbf{1}\{L_t\le y_t\le U_t\}`, "Share of actual observations inside the prediction interval. Target ≈95%, not necessarily higher."],
  ["Mean interval width", String.raw`\mathrm{Width}=\frac{1}{N}\sum_t(U_t-L_t)`, "Smaller is desirable at comparable coverage."],
  ["Interval failures", String.raw`\mathrm{Failures}=100-\mathrm{Coverage}`, "Share of observed loads falling outside the 95% interval. Nominal target ≈5%."],
  ["APE > 5%", String.raw`\mathrm{APE}_t=100\frac{|y_t-\hat y_t|}{|y_t|}`, "Percentage of hours with APE strictly exceeding 5%. Lower is better."],
  ["MAE — Mean absolute error", String.raw`\mathrm{MAE}=\frac{1}{N}\sum_t|y_t-\hat y_t|`, "Average absolute deviation in MW. Lower is better."],
  ["RMSE — Root mean squared error", String.raw`\mathrm{RMSE}=\sqrt{\frac{1}{N}\sum_t(y_t-\hat y_t)^2}`, "More sensitive to large errors than MAE. Lower is better."],
  ["Absolute difference", String.raw`\Delta_{\mathrm{abs}}=M_{\mathrm{model}}-M_{\mathrm{RTE}}`, "Model minus RTE in the original metric units (MW, percentage points, or R²). Negative favors the model for error metrics."],
  ["Relative difference", String.raw`\Delta_{\mathrm{rel}}=100\frac{M_{\mathrm{model}}-M_{\mathrm{RTE}}}{|M_{\mathrm{RTE}}|}`, "Relative percentage change versus RTE. Not percentage points. Undefined when the RTE metric is zero."],
];

function Explanations({ residual = false }) {
  if (residual) return <details className="stats-explanations">
    <summary>Statistical test definitions and interpretation</summary>
    <div className="stats-explanation-content">
      <div className="stats-metric-definition">
        <strong>Augmented Dickey–Fuller (ADF)</strong>
        <p>Tests the null of a unit root in forecast residuals.</p>
        <div className="stats-formula"><Latex block expression={String.raw`\Delta e_t=\alpha+\gamma e_{t-1}+\sum_{i=1}^{p}\beta_i\Delta e_{t-i}+u_t`} /></div>
        <div className="stats-formula"><Latex block expression={String.raw`H_0:\gamma=0\qquad H_1:\gamma<0`} /></div>
        <p>p &lt; 0.05 rejects the unit-root null. The backend uses a constant and 24 fixed augmented lags for sufficiently long series.</p>
      </div>
      <div className="stats-metric-definition">
        <strong>Ljung–Box test</strong>
        <p>Tests whether autocorrelations up to lag h are jointly zero.</p>
        <div className="stats-formula"><Latex block expression={String.raw`Q(h)=N(N+2)\sum_{k=1}^{h}\frac{\hat\rho_k^2}{N-k}`} /></div>
        <div className="stats-formula"><Latex block expression={String.raw`H_0:\rho_1=\rho_2=\cdots=\rho_h=0`} /></div>
        <p>Here h = 24 for long series. p &lt; 0.05 provides evidence of residual autocorrelation. Failing to reject does not prove white noise.</p>
      </div>
      <p>Stationary residuals may still be autocorrelated. Neither test alone proves good forecasting performance.</p>
    </div>
  </details>;
  return <details className="stats-explanations">
    <summary>Metric definitions and interpretation</summary>
    <div className="stats-explanation-content">
      <p>Here y is observed electricity demand, ŷ is the forecast and [L, U] is its 95% prediction interval.</p>
      {METRIC_EXPLANATIONS.map(([name, formula, desc]) => (
        <div className="stats-metric-definition" key={name}>
          <strong>{name}</strong>
          <div className="stats-formula"><Latex expression={formula} block /></div>
          <p>{desc}</p>
        </div>
      ))}
    </div>
  </details>;
}

function WeeklyChart({ chart, index }) {
  const color = index === 0 ? "#c58a36" : "#087c82";

  return (
    <div className="stats-visual-panel">
      <h4>
        {chart?.label ?? (index === 0 ? "RTE" : "Model")} — reliability
      </h4>

      <div className="stats-fixed-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chart?.points ?? []}
            margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              stroke="#e1e8ed"
              strokeDasharray="3 4"
            />

            <XAxis
              dataKey="utc"
              tickFormatter={formatHour}
              tick={{ fontSize: 10 }}
              minTickGap={28}
            />

            <YAxis
              width={55}
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />

            <Tooltip
              labelFormatter={formatHour}
              formatter={(value, name) => [
                Array.isArray(value)
                  ? `${displayNumber(value[0])} – ${displayNumber(value[1])} MW`
                  : `${displayNumber(value)} MW`,
                name,
              ]}
            />

            <Area
              dataKey="interval"
              name="95% interval"
              fill={color}
              fillOpacity={0.18}
              stroke="none"
              isAnimationActive={false}
            />

            <Line
              dataKey="load"
              name="Observed load"
              stroke="#243447"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />

            <Line
              dataKey="prediction"
              name={chart?.label ?? "Forecast"}
              stroke={color}
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />

            <Line
              dataKey="above_5"
              name="APE > 5%"
              stroke="none"
              legendType="none"
              dot={{
                r: 2,
                fill: "#f08c28",
                strokeWidth: 0,
              }}
              activeDot={false}
              isAnimationActive={false}
            />

            <Line
              dataKey="outside"
              name="Outside interval"
              stroke="none"
              legendType="none"
              dot={{
                r: 2.3,
                fill: "#d62828",
                strokeWidth: 0,
              }}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WeeklyAudit({ weekly, model }) {
  const charts = weekly?.charts ?? [
    { label: "RTE", points: [] },
    { label: model.toUpperCase(), points: [] },
  ];
  return <>
    <div className="statistical-tests-period">
      <span><strong>Window:</strong> {weekly?.start ?? "—"} → {weekly?.end ?? "—"}</span>
      <span><strong>Hours:</strong> {weekly?.count ?? "—"}</span>
    </div>
    {weekly?.message ? <div className="stats-empty">{weekly.message}</div> :
      <div className="stats-weekly-grid">{charts.map((chart, i) => <WeeklyChart key={i} chart={chart} index={i} />)}</div>}
    <div className="stats-marker-legend">
      <span><i className="stats-dot stats-dot-orange" /> APE &gt; 5%</span>
      <span><i className="stats-dot stats-dot-red" /> Outside 95% interval</span>
    </div>
    <p className="stats-caption">Red takes priority when both conditions occur. Markers represent the observed load at that hour.</p>
  </>;
}

function ResidualHistogram({ histogram, modelLabel }) {
  return <div className="stats-visual-panel">
    <h4>Forecast error distribution</h4>
    <div className="stats-fixed-chart"><ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={histogram ?? []} margin={{ top: 12, right: 10, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#e1e8ed" strokeDasharray="3 4" />
        <XAxis dataKey="center" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 10 }} tickFormatter={(v) => displayNumber(v)} />
        <YAxis width={44} tick={{ fontSize: 10 }} />
        <Tooltip labelFormatter={(v) => `${displayNumber(v)} MW`} />
        <ReferenceLine x={0} stroke="#243447" strokeDasharray="4 3" />
        <Bar dataKey="rte" name="RTE" fill="#c58a36" fillOpacity={0.52} isAnimationActive={false} />
        <Bar dataKey="model" name={modelLabel ?? "Model"} fill="#087c82" fillOpacity={0.52} isAnimationActive={false} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    </ResponsiveContainer></div>
  </div>;
}

function ResidualTestsTable({ tests }) {
  const latex = useMemo(() => {
    const rows = (tests ?? []).map((row) => [`\\text{${row.model}}`, formatP(row.adf_pvalue), formatP(row.ljung_box_pvalue)].join(" & "));
    return String.raw`\begin{array}{lcc}
\hline
\text{Model} & \text{ADF }p & \text{LB(24) }p \\
\hline
${rows.length ? rows.join(" \\\\ ") : "\\text{RTE} & \\text{--} & \\text{--} \\\\ \\text{Model} & \\text{--} & \\text{--}"} \\
\hline
\end{array}`;
  }, [tests]);
  return <div className="stats-diagnostics-table">
    <h4>Residual hypothesis tests</h4>
    <div className="stats-diagnostics-latex"><Latex expression={latex} block /></div>
    <div className="stats-test-interpretation">
      <p><strong>ADF:</strong> p &lt; 0.05 rejects the unit-root null, supporting stationarity under the test assumptions.</p>
      <p><strong>Ljung–Box (24 lags):</strong> p &lt; 0.05 rejects the absence of residual autocorrelation.</p>
      <p>Tests use the common evaluation period.</p>
    </div>
  </div>;
}

export default function StatisticalTestsSection({ model = "sarima", mode, start, end }) {
  const summary = useStatistics("summary", model, mode, start, end);
  const weekly = useStatistics("weekly", model, mode, start, end);
  const residuals = useStatistics("residuals", model, mode, start, end);

  return <div className="statistical-tests-section">
    <section className="statistical-tests-card">
      <h3>Forecast performance comparison</h3>
      <p className="statistical-tests-description">Point forecast accuracy and 95% prediction interval reliability, evaluated against observed electricity demand.</p>
      <div className="statistical-tests-period">
        <span><strong>Evaluation:</strong> {mode === "today" ? "All available history" : "Custom period"}</span>
        <span>{summary.data?.start ?? "—"} → {summary.data?.end ?? "—"}</span>
        <span><strong>Observations:</strong> {displayNumber(summary.data?.n ?? 0)} hours</span>
      </div>
      <PerformanceTable summary={summary.data} />
      {summary.error && <p className="statistical-tests-error">{summary.error}</p>}
      <Explanations />
    </section>

    <section className="statistical-tests-card">
      <h3>Weekly forecast reliability</h3>
      <p className="statistical-tests-description">A visual audit of 95% interval coverage and forecast errors exceeding a 5% relative-error threshold, on up to seven days of observed data.</p>
      <WeeklyAudit weekly={weekly.data} model={model} />
      {weekly.error && <p className="statistical-tests-error">{weekly.error}</p>}
    </section>

    <section className="statistical-tests-card">
      <h3>Residual diagnostics</h3>
      <p className="statistical-tests-description">Comparison of forecast error distributions and tests for stationarity and autocorrelation.</p>
      <div className="stats-diagnostics-grid">
        <ResidualHistogram histogram={residuals.data?.histogram} modelLabel={residuals.data?.model_label} />
        <ResidualTestsTable tests={residuals.data?.tests} />
      </div>
      <Explanations residual />
      {residuals.error && <p className="statistical-tests-error">{residuals.error}</p>}
    </section>
  </div>;
}
