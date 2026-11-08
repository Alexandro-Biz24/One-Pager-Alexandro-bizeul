
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./SarimaModelSection.css";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const PARIS_TZ = "Europe/Paris";

/* =========================================================
   DATE UTILITIES
   ========================================================= */

function parisDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function formatHour(utc) {
  if (!utc) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utc));
}

function exportTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return (
    `${get("year")}-${get("month")}-${get("day")}_` +
    `${get("hour")}-${get("minute")}`
  );
}

/* =========================================================
   DATA UTILITIES
   ========================================================= */

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePoint(point) {
    const sarima = point.predictions?.sarima ?? point.sarima ?? {};
  
    const lower = numberOrNull(sarima.lower_95);
    const upper = numberOrNull(sarima.upper_95);
  
    const rteLower = numberOrNull(point.rte_lower_95);
    const rteUpper = numberOrNull(point.rte_upper_95);
  
    return {
      utc: point.utc,
      local_time: point.local_time,
  
      load: numberOrNull(point.load),
      rte: numberOrNull(point.rte),
  
      rte_lower_95: rteLower,
      rte_upper_95: rteUpper,
  
      rte_confidence:
        rteLower !== null && rteUpper !== null
          ? [rteLower, rteUpper]
          : null,
  
      prediction: numberOrNull(sarima.prediction),
      lower_95: lower,
      upper_95: upper,
  
      confidence:
        lower !== null && upper !== null
          ? [lower, upper]
          : null,
    };
  }

/* =========================================================
   LATEX
   ========================================================= */

function Latex({ expression, block = false }) {
  const html = useMemo(
    () =>
      katex.renderToString(expression, {
        displayMode: block,
        throwOnError: false,
        strict: "ignore",
      }),
    [expression, block]
  );

  return (
    <span
      className={
        block ? "sarima-latex-block" : "sarima-latex-inline"
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* =========================================================
   SARIMA EQUATIONS
   ========================================================= */

const EQUATIONS = {
  general: String.raw`
    \underbrace{
      \left(1-\sum_{i=1}^{p}\phi_i B^i\right)
    }_{\text{AR}}
    \underbrace{
      \left(1-\sum_{j=1}^{P}\Phi_j B^{sj}\right)
    }_{\text{Seasonal AR}}
    w_t
    =
    \underbrace{
      \left(1+\sum_{i=1}^{q}\theta_i B^i\right)
    }_{\text{MA}}
    \underbrace{
      \left(1+\sum_{j=1}^{Q}\Theta_j B^{sj}\right)
    }_{\text{Seasonal MA}}
    \varepsilon_t
  `,

  difference: String.raw`
    \boxed{
      w_t=(1-B)^d(1-B^s)^D y_t
    }
  `,

  binomial: String.raw`
    \boxed{
      w_t=
      \sum_{r=0}^{d}
      \sum_{m=0}^{D}
      (-1)^{r+m}
      \binom{d}{r}
      \binom{D}{m}
      y_{t-r-sm}
    }
  `,

  fittedDifference: String.raw`
    w_t=(1-B^{24})y_t=y_t-y_{t-24}
  `,

  fitted: String.raw`
    \left(
      1-\sum_{i=1}^{3}\phi_i B^i
    \right)w_t
    =
    \left(
      1+\sum_{i=1}^{3}\theta_i B^i
    \right)\varepsilon_t
  `,
};

/* =========================================================
   MODEL SPECIFICATION
   ========================================================= */

function ModelSpecification() {
  const parameters = [
    ["p", "Non-seasonal autoregressive order"],
    ["d", "Non-seasonal differencing order"],
    ["q", "Non-seasonal moving-average order"],
    ["P", "Seasonal autoregressive order"],
    ["D", "Seasonal differencing order"],
    ["Q", "Seasonal moving-average order"],
    ["s", "Seasonal period, expressed in hours"],
  ];

  const fittedParameters = [
    "p=3",
    "d=0",
    "q=3",
    "P=0",
    "D=1",
    "Q=0",
    "s=24",
  ];

  return (
    <section className="sarima-card sarima-knowledge">
      

      <div className="sarima-equation-tag">
        <Latex
          expression={String.raw`
            \operatorname{SARIMA}(3,0,3)(0,1,0)_{24}
          `}
        />
      </div>

      <h4>1. General SARIMA formulation</h4>

      <p>
        Consider a seasonal autoregressive integrated
        moving-average model:
      </p>

      <Latex
        expression={String.raw`
          \operatorname{SARIMA}(p,d,q)(P,D,Q)_{s}
        `}
        block
      />

      <div className="sarima-parameter-list">
        {parameters.map(([symbol, description]) => (
          <div className="sarima-parameter-row" key={symbol}>
            <div className="sarima-parameter-symbol">
              <Latex expression={symbol} />
            </div>
            <span>{description}</span>
          </div>
        ))}
      </div>

      <p>
        Using the following sign convention,
        the general SARIMA equation is:
      </p>

      <Latex expression={EQUATIONS.general} block />

      <h4>2. Differenced process</h4>

      <p>Let the backshift operator be defined as:</p>

      <Latex
        expression={String.raw`B^k y_t=y_{t-k}`}
        block
      />

      <p>The transformed process is:</p>

      <Latex expression={EQUATIONS.difference} block />

      <p>
        Applying the binomial theorem to both
        differencing operators gives:
      </p>

      <Latex expression={EQUATIONS.binomial} block />

      <h4>3. Our fitted SARIMA model</h4>

      <p>The selected specification is:</p>

      <Latex
        expression={String.raw`
          \operatorname{SARIMA}(3,0,3)(0,1,0)_{24}
        `}
        block
      />

      <p>Its parameters are:</p>

      <div className="sarima-fitted-parameters">
        {fittedParameters.map((formula) => (
          <div key={formula}>
            <Latex expression={formula} />
          </div>
        ))}
      </div>

      <p>
        With one seasonal difference and no
        non-seasonal difference:
      </p>

      <Latex expression={EQUATIONS.fittedDifference} block />

      <p>
        Since the seasonal autoregressive and
        moving-average orders are both zero:
      </p>

      <Latex expression={String.raw`P=Q=0`} block />

      <Latex
        expression={String.raw`
          \Phi(B^{24})=\Theta(B^{24})=1
        `}
        block
      />

      <p>
        The resulting autoregressive moving-average
        equation for the seasonally differenced
        series is:
      </p>

      <Latex expression={EQUATIONS.fitted} block />

      <div className="sarima-method-note">
        <strong>Production inference</strong>
        <span>
          Parameters are estimated offline and stored
          in a serialized model artifact. During daily
          inference, the model state is refreshed using
          recent observed load without re-estimating
          the coefficients.
        </span>
      </div>

      <a
        className="sarima-paper-link"
        href="/papers/national-demand-note"
      >
        Read the full forecasting methodology
      </a>
    </section>
  );
}

/* =========================================================
   CSV EXPORT
   ========================================================= */

function CSVDownload({ raw, start, end }) {
  function downloadCSV() {
    if (!raw?.series?.length) return;

    function flatten(value, prefix = "", result = {}) {
      for (const [key, item] of Object.entries(value)) {
        const column = prefix ? `${prefix}.${key}` : key;

        if (
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
          flatten(item, column, result);
        } else {
          result[column] =
            item === null || item === undefined
              ? ""
              : Array.isArray(item)
                ? JSON.stringify(item)
                : item;
        }
      }
      return result;
    }

    const rows = raw.series.map((point) => flatten(point));
    const columns = [...new Set(rows.flatMap(Object.keys))];

    const escapeCell = (value) => {
      const text = String(value ?? "");
      return `"${text.replaceAll('"', '""')}"`;
    };

    const csv = [
      columns.map(escapeCell).join(","),
      ...rows.map((row) =>
        columns.map((column) => escapeCell(row[column])).join(",")
      ),
    ].join("\r\n");

    const filename =
      `sarima_${start}_${end}_export_` +
      `${exportTimestamp()}_Paris.csv`;

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (

      <button
        type="button"
        onClick={downloadCSV}
        disabled={!raw?.series?.length}
      >
        Download CSV
      </button>
   
  );
}

/* =========================================================
   CHART TOOLTIP
   ========================================================= */

   function ChartTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
  
    const point = payload[0]?.payload;
    if (!point) return null;
  
    const values = [
      ["Observed load", point.load],
      ["RTE D-1", point.rte],
      ["RTE lower 95%", point.rte_lower_95],
      ["RTE upper 95%", point.rte_upper_95],
      ["SARIMA", point.prediction],
      ["SARIMA lower 95%", point.lower_95],
      ["SARIMA upper 95%", point.upper_95],
    ];
  
    return (
      <div className="sarima-tooltip">
        <strong>{formatHour(point.utc)} — Paris</strong>
  
        {values.map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <b>
              {value === null || value === undefined
                ? "—"
                : `${value.toLocaleString("en-GB", {
                    maximumFractionDigits: 0,
                  })} MW`}
            </b>
          </div>
        ))}
      </div>
    );
  }

/* =========================================================
   MAIN SARIMA COMPONENT
   ========================================================= */

   export default function SarimaModelSection({
        mode,
        setMode,
        start,
        setStart,
        end,
        setEnd,
        latestDay,
    }) {


  /* API STATE */

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* CHART CONTROLS */



  /* TODAY = NEXT-DAY FORECAST */

  const today = parisDate();

  const selectedStart =
    mode === "today" ? latestDay : start;

  const selectedEnd =
    mode === "today" ? latestDay : end;

  const validPeriod =
    Boolean(selectedStart) &&
    Boolean(selectedEnd) &&
    selectedStart <= selectedEnd;

  /* =======================================================
     FETCH FROM FASTAPI / NEON
     ======================================================= */

  useEffect(() => {
    if (!validPeriod) {
      setRaw(null);
      setError(
        mode === "today" && !latestDay
          ? ""
          : "Invalid date range."
      );
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function fetchForecasts() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        start: selectedStart,
        end: selectedEnd,
        models: "sarima",
      });

      try {
        const response = await fetch(
          `${API_BASE}/timeseries/series?${params.toString()}`,
          {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `Forecast API returned HTTP ${response.status}`
          );
        }

        const json = await response.json();

        // FastAPI returns "data".
        // Keep "series" internally for chart and CSV.
        const series =
          json.data ??
          json.series ??
          json.points;

        if (!Array.isArray(series)) {
          throw new Error(
            "The API response does not contain an hourly series."
          );
        }

        setRaw({
          ...json,
          series,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchForecasts();

    return () => controller.abort();
  }, [selectedStart, selectedEnd, validPeriod]);


  /* CHART DATA */

  const data = useMemo(
    () =>
      (raw?.series ?? [])
        .map(normalizePoint)
        .filter((point) => point.utc)
        .sort(
          (a, b) =>
            new Date(a.utc).getTime() -
            new Date(b.utc).getTime()
        ),
    [raw]
  );

  const hasValues = data.some(
    (point) =>
      point.load !== null ||
      point.rte !== null ||
      point.prediction !== null
  );

  const availableCount = data.filter(
    (point) => point.prediction !== null
  ).length;

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="sarima-section">

      {/* ==========================================
          1. FORECAST CARD
          Title → Switcher → Period → Model → Chart
          ========================================== */}

      <section className="sarima-card sarima-chart-card">

        {/* TITLE */}

        <div className="sarima-chart-heading">
          <h3>SARIMA electricity demand forecasts</h3>
        </div>

        {/* TODAY / CUSTOM PERIOD SWITCHER */}

        <div className="sarima-period-control">
          <div className="sarima-switcher">
            <button
              type="button"
              className={mode === "today" ? "active" : ""}
              onClick={() => setMode("today")}
            >
              Today
            </button>

            <button
              type="button"
              className={mode === "custom" ? "active" : ""}
              onClick={() => setMode("custom")}
            >
              Custom period
            </button>
          </div>

          {mode === "custom" && (
            <div className="sarima-date-fields">
              <label>
                From
                <input
                  type="date"
                  value={start}
                  max={end}
                  onChange={(event) =>
                    setStart(event.target.value)
                  }
                />
              </label>

              <label>
                To
                <input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(event) =>
                    setEnd(event.target.value)
                  }
                />
              </label>
            </div>
          )}
        </div>

        {/* PERIOD AND MODEL */}

        <div className="sarima-chart-metadata">
          <p>
            <strong>Period:</strong>{" "}
            {formatDate(selectedStart)}
            {selectedStart !== selectedEnd &&
              ` – ${formatDate(selectedEnd)}`}

            {mode === "today" && (
              <span>
                {latestDay && (<> {" "}(forecast issued on {formatDate(shiftDate(latestDay, -1))})</>)}
              </span>
            )}
          </p>

          <p>
            <strong>Model:</strong>{" "}
            SARIMA(3,0,3)(0,1,0)[24]
          </p>
        </div>

        {/* TOOLBAR */}

        <div className="sarima-chart-toolbar">
          <span>
            {loading
              ? "Loading forecasts..."
              : `${availableCount} SARIMA predictions / ${data.length} hours`}
          </span>

          <CSVDownload
            raw={raw}
            start={selectedStart}
            end={selectedEnd}
          />
        </div>

        {/* API ERROR */}

        {error && (
          <p className="sarima-error">{error}</p>
        )}

        {/* EMPTY STATE */}

        {!loading && !error && !hasValues && (
          <p className="sarima-empty">
            No forecast or observation is available
            for this period yet.
          </p>
        )}

        {/* CHART */}

        
          <>
            <div
              className="sarima-chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data}
                  margin={{
                    top: 15,
                    right: 10,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 4"
                    stroke="#e1e8ed"
                  />

                  <XAxis
                    dataKey="utc"
                    minTickGap={35}
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatHour}
                  />

                  <YAxis
                    width={62}
                    domain={["auto", "auto"]}
                    tick={!loading && hasValues ? { fontSize: 11 } : false}
                    tickFormatter={(value) =>
                      `${(value / 1000).toFixed(0)}k`
                    }
                    label={{
                      value: "MW",
                      angle: -90,
                      position: "insideLeft",
                      offset: 8,
                    }}
                  />

                  <Tooltip
                    content={<ChartTooltip />}
                    isAnimationActive={false}
                  />

                  <Legend
                    verticalAlign="bottom"
                    height={38}
                    wrapperStyle={{ fontSize: 12 }}
                  />

                  {/* 95% CONFIDENCE BAND */}

                  {/* RTE 95% PREDICTION INTERVAL */}

                <Area
                    type="linear"
                    name="RTE 95% interval"
                    dataKey="rte_confidence"
                    stroke="none"
                    fill="#c58a36"
                    fillOpacity={0.17}
                    connectNulls={false}
                    isAnimationActive={false}
                />

                {/* SARIMA 95% PREDICTION INTERVAL */}

                <Area
                    type="linear"
                    name="SARIMA 95% interval"
                    dataKey="confidence"
                    stroke="none"
                    fill="#89adc9"
                    fillOpacity={0.22}
                    connectNulls={false}
                    isAnimationActive={false}
                />

                  {/* OBSERVED LOAD */}

                  <Line
                    type="linear"
                    name="Observed load"
                    dataKey="load"
                    stroke="#243447"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* RTE DAY-AHEAD FORECAST */}

                  <Line
                    type="linear"
                    name="RTE D-1"
                    dataKey="rte"
                    stroke="#c58a36"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* SARIMA FORECAST */}

                  <Line
                    type="linear"
                    name="SARIMA forecast"
                    dataKey="prediction"
                    stroke="#087c82"
                    strokeWidth={2.7}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                </ComposedChart>
              </ResponsiveContainer>
            </div>

          </>
        
      </section>

      {/* MATHEMATICAL SPECIFICATION — COLLAPSED BY DEFAULT */}
      <details className="sarima-method-accordion">
        <summary>
          <span>Mathematical specification</span>
          <span className="sarima-method-chevron" aria-hidden="true" />
        </summary>
        <div className="sarima-method-accordion-content">
          <ModelSpecification />
        </div>
      </details>

    </div>
  );
}
