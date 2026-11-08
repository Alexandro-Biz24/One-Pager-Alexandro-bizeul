
import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
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

import "./SarimaModelSection.css";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const MODELS = {
  lightgbm: {
    name: "LightGBM",
    title: "LightGBM electricity demand forecasts",
    description: "Gradient-boosted residual correction of RTE forecasts",
    color: "#087c82",
  },

  mtst: {
    name: "MTST",
    title: "MTST electricity demand forecasts",
    description: "Deep-learning residual correction of RTE forecasts",
    color: "#087c82",
  },
};

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatDate(value) {
  if (!value) return "—";

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function shiftDate(value, days) {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatHour(utc) {
  if (!utc) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utc));
}

function normalizePoint(point, model) {
  const forecast = point.predictions?.[model] ?? {};

  const lower = numberOrNull(forecast.lower_95);
  const upper = numberOrNull(forecast.upper_95);

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

    prediction: numberOrNull(forecast.prediction),
    lower_95: lower,
    upper_95: upper,

    confidence:
      lower !== null && upper !== null
        ? [lower, upper]
        : null,
  };
}

function ChartTooltip({ active, payload, modelName }) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  if (!point) return null;

  const values = [
    ["Observed load", point.load],
    ["RTE D-1", point.rte],
    ["RTE lower 95%", point.rte_lower_95],
    ["RTE upper 95%", point.rte_upper_95],
    [modelName, point.prediction],
    [`${modelName} lower 95%`, point.lower_95],
    [`${modelName} upper 95%`, point.upper_95],
  ];

  return (
    <div className="sarima-tooltip">
      <strong>
        {formatHour(point.utc)} — Paris
      </strong>

      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>

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

function CSVDownload({ raw, model, start, end }) {
  function downloadCSV() {
    const series = raw?.series ?? [];

    if (!series.length) return;

    const rows = series.map((point) => {
      const forecast = point.predictions?.[model] ?? {};

      return {
        utc: point.utc,
        local_time: point.local_time,
        load: point.load,
        temperature: point.temperature,
        rte: point.rte,
        rte_lower_95: point.rte_lower_95,
        rte_upper_95: point.rte_upper_95,
        prediction: forecast.prediction,
        lower_95: forecast.lower_95,
        upper_95: forecast.upper_95,
      };
    });

    const columns = Object.keys(rows[0]);

    const escape = (value) => {
      const text = String(value ?? "");
      return `"${text.replaceAll('"', '""')}"`;
    };

    const csv = [
      columns.map(escape).join(","),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${model}_${start}_${end}.csv`;

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


function Equation({ children }) {
    return (
      <div
        style={{
          overflowX: "auto",
          padding: "8px 0",
          textAlign: "center",
          fontSize: "1.1rem",
        }}
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(children, {
            displayMode: true,
            throwOnError: false,
          }),
        }}
      />
    );
  }
  
  function MathStep({ title, children }) {
    return (
      <div className="stats-metric-definition">
        <strong>{title}</strong>
        {children}
      </div>
    );
  }
  
  function LightGBMMathematics() {
    return (
      <div className="stats-explanation-content">
        <h4>LightGBM — Gradient Boosted Residual Correction</h4>
  
        <MathStep title="1. Learning target">
          <p>
            Instead of predicting demand directly, LightGBM
            learns the correction required by the official
            RTE day-ahead forecast.
          </p>
          <Equation>{String.raw`
            e_t=y_t-\widehat y_t^{RTE}
          `}</Equation>
          <p>
            Here, y is observed electricity demand and e
            is the signed RTE forecasting error.
          </p>
        </MathStep>
  
        <MathStep title="2. Additive gradient boosting">
          <p>
            LightGBM builds an ensemble of regression trees
            sequentially. Each tree improves the predictions
            made by the existing ensemble.
          </p>
          <Equation>{String.raw`
            F_m(x)=F_{m-1}(x)+\eta f_m(x)
          `}</Equation>
          <p>
            The learning rate η controls the contribution
            of each successive tree.
          </p>
        </MathStep>
  
        <MathStep title="3. Gradient-based optimization">
          <p>
            At boosting iteration m, the negative gradient
            of the objective determines the correction
            direction.
          </p>
          <Equation>{String.raw`
            r_{i,m}=
            -\left.
            \frac{\partial\ell(e_i,F(x_i))}
            {\partial F(x_i)}
            \right|_{F=F_{m-1}}
          `}</Equation>
          <p>
            For squared-error loss, these pseudo-residuals
            are proportional to the remaining prediction errors.
            LightGBM uses gradient and Hessian information
            to optimize its tree leaves.
          </p>
        </MathStep>
  
        <MathStep title="4. Final boosted estimator">
          <Equation>{String.raw`
            \widehat e_t=
            F_0(x_t)+\eta\sum_{m=1}^{M}f_m(x_t)
          `}</Equation>
          <p>
            The output represents the estimated signed
            correction, expressed in MW.
          </p>
        </MathStep>
  
        <MathStep title="5. Final day-ahead forecast">
          <Equation>{String.raw`
            \boxed{
            \widehat y_t^{ML}
            =
            \widehat y_t^{RTE}
            +
            \widehat e_t
            }
          `}</Equation>
          <p>
            A positive correction increases the RTE forecast;
            a negative correction decreases it. The model
            therefore learns how to correct systematic
            forecasting errors rather than reconstructing
            electricity demand from scratch.
          </p>
        </MathStep>
      </div>
    );
  }
  
  function MTSTMathematics() {
    return (
      <div className="stats-explanation-content">
        <h4>MTST — Multi-resolution Time-Series Transformer</h4>
  
        <MathStep title="1. Input sequence">
          <p>
            A historical look-back window enters the network.
            The initial representation contains L observations.
          </p>
          <Equation>{String.raw`
            \mathbf y^{(0)}
            =
            [x_1,\ldots,x_L]^\top
            \in\mathbb R^L
          `}</Equation>
        </MathStep>
  
        <MathStep title="2. Multi-resolution patch tokenization">
          <p>
            Each branch divides its input representation
            into overlapping temporal patches. Different
            patch sizes provide different temporal resolutions.
          </p>
          <Equation>{String.raw`
            \widetilde Y^{(b,n)}
            =
            \mathcal T_b(\mathbf y^{(n-1)})
            \in\mathbb R^{J_b\times P_b}
          `}</Equation>
          <Equation>{String.raw`
            J_b=
            \left\lfloor
            \frac{d_{n-1}-P_b}{S_b}
            \right\rfloor+1
          `}</Equation>
          <p>
            P denotes patch length, S denotes stride
            and J denotes the number of patches.
            End padding may be added when needed.
            Small patches capture fine-grained patterns;
            large patches capture coarser temporal structures.
          </p>
        </MathStep>
  
        <MathStep title="3. Sinusoidal relative positional encoding">
          <p>
            The model uses sinusoidal functions of the signed
            distance between patch positions, rather than
            simply adding absolute position vectors to tokens.
          </p>
          <Equation>{String.raw`
            p_{ij}
            =
            \operatorname{sign}(i-j)
            PE(|i-j|)
          `}</Equation>
          <Equation>{String.raw`
            PE_{2k}(d)=
            \sin\left(
            \frac{d}{10000^{2k/D_{pos}}}
            \right)
          `}</Equation>
          <Equation>{String.raw`
            PE_{2k+1}(d)=
            \cos\left(
            \frac{d}{10000^{2k/D_{pos}}}
            \right)
          `}</Equation>
          <p>
            This supplies information about relative temporal
            distances and helps attention identify repeated
            patterns at different lags.
          </p>
        </MathStep>
  
        <MathStep title="4. Transformer attention in each branch">
          <p>
            Each branch independently computes multi-head
            self-attention over its patch tokens.
            Relative positional information contributes
            directly to the attention logits.
          </p>
          <Equation>{String.raw`
            \alpha_{ij}
            =
            \operatorname{Softmax}_j
            \left(
            \frac{q_i^\top k_j}{\sqrt D}
            +w_{pos}^\top p_{ij}
            \right)
          `}</Equation>
          <Equation>{String.raw`
            z_i=\sum_j\alpha_{ij}v_j
          `}</Equation>
          <p>
            Multi-head attention is followed by residual
            connections, normalization and a feed-forward
            network, as in a standard Transformer encoder.
          </p>
        </MathStep>
  
        <MathStep title="5. Flattening and branch fusion">
          <p>
            Branch representations are flattened independently,
            concatenated, and projected into a shared
            representation using a learned linear layer.
          </p>
          <Equation>{String.raw`
            \mathbf z^{(n)}
            =
            \operatorname{Concat}
            \left(
            \operatorname{Flatten}(Z_1^{(n)}),
            \ldots,
            \operatorname{Flatten}(Z_B^{(n)})
            \right)
          `}</Equation>
          <Equation>{String.raw`
            \mathbf y^{(n)}
            =
            W^{(n)}\mathbf z^{(n)}+b^{(n)}
          `}</Equation>
          <p>
            This fusion combines information from all
            temporal resolutions. Its output becomes the
            input to the next MTST layer. The process
            repeats across the network.
          </p>
        </MathStep>
  
        <MathStep title="6. Forecast horizon projection">
          <p>
            At the final layer, the fused representation
            produces a vector covering the forecast horizon H.
          </p>
          <Equation>{String.raw`
            \widehat{\mathbf e}
            =
            [\widehat e_{t+1},\ldots,
            \widehat e_{t+H}]^\top
          `}</Equation>
          <p>
            In the residual-correction formulation,
            this vector contains predicted RTE errors.
            For the day-ahead application, H equals 24
            forecast hours.
          </p>
        </MathStep>
  
        <MathStep title="7. Final electricity demand reconstruction">
          <Equation>{String.raw`
            \boxed{
            \widehat{\mathbf y}^{DL}
            =
            \widehat{\mathbf y}^{RTE}
            +
            \widehat{\mathbf e}^{MTST}
            }
          `}</Equation>
          <p>
            The predicted correction is added elementwise
            to the official RTE forecast to reconstruct
            the final electricity demand profile.
          </p>
        </MathStep>
      </div>
    );
  }

  
export default function ForecastModelSection({
  model,
  mode,
  setMode,
  start,
  setStart,
  end,
  setEnd,
  latestDay,
}) {
  const config = MODELS[model];

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedStart =
    mode === "today" ? latestDay : start;

  const selectedEnd =
    mode === "today" ? latestDay : end;

  const validPeriod =
    Boolean(selectedStart) &&
    Boolean(selectedEnd) &&
    selectedStart <= selectedEnd;

  useEffect(() => {
    if (!validPeriod) {
      setError(
        mode === "today"
          ? ""
          : "Invalid date range."
      );
      return;
    }

    const controller = new AbortController();

    async function fetchForecasts() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        start: selectedStart,
        end: selectedEnd,
        models: model,
      });

      try {
        const response = await fetch(
          `${API_BASE}/timeseries/series?${params}`,
          {
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

        const series =
          json.data ??
          json.series ??
          json.points;

        if (!Array.isArray(series)) {
          throw new Error(
            "Invalid hourly forecast response"
          );
        }

        if (!controller.signal.aborted) {
          setRaw({
            ...json,
            series,
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
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
  }, [model, selectedStart, selectedEnd, validPeriod, mode]);

  const data = useMemo(() => {
    return (raw?.series ?? [])
      .map((point) => normalizePoint(point, model))
      .filter((point) => point.utc)
      .sort(
        (a, b) =>
          new Date(a.utc).getTime() -
          new Date(b.utc).getTime()
      );
  }, [raw, model]);

  const hasValues = data.some(
    (point) =>
      point.load !== null ||
      point.rte !== null ||
      point.prediction !== null
  );

  const availableCount = data.filter(
    (point) => point.prediction !== null
  ).length;

  if (!config) {
    return (
      <p className="sarima-error">
        Unsupported forecast model.
      </p>
    );
  }

  return (
    <div className="sarima-section">

      {/* FORECAST CARD */}

      <section className="sarima-card sarima-chart-card">

        <div className="sarima-chart-heading">
          <h3>{config.title}</h3>
        </div>

        {/* PERIOD SWITCHER */}

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

        {/* METADATA */}

        <div className="sarima-chart-metadata">

          <p>
            <strong>Period:</strong>{" "}
            {formatDate(selectedStart)}

            {selectedStart !== selectedEnd &&
              ` – ${formatDate(selectedEnd)}`}

            {mode === "today" && latestDay && (
              <span>
                {" "}(forecast issued on{" "}
                {formatDate(shiftDate(latestDay, -1))})
              </span>
            )}
          </p>

          <p>
            <strong>Model:</strong>{" "}
            {config.description}
          </p>

        </div>

        {/* TOOLBAR */}

        <div className="sarima-chart-toolbar">

          <span>
            {loading
              ? "Loading forecasts..."
              : `${availableCount} ${config.name} predictions / ${data.length} hours`}
          </span>

          <CSVDownload
            raw={raw}
            model={model}
            start={selectedStart}
            end={selectedEnd}
          />

        </div>

        {error && (
          <p className="sarima-error">{error}</p>
        )}

        {!loading && !error && !hasValues && validPeriod && (
          <p className="sarima-empty">
            No forecast or observation is available
            for this period yet.
          </p>
        )}

        {/* PERSISTENT CHART */}

        <div className="sarima-chart">
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
                tick={
                  !loading && hasValues
                    ? { fontSize: 11 }
                    : false
                }
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
                content={
                  <ChartTooltip
                    modelName={config.name}
                  />
                }
                isAnimationActive={false}
              />

              <Legend
                verticalAlign="bottom"
                height={38}
                wrapperStyle={{
                  fontSize: 12,
                }}
              />

              {/* RTE 95% INTERVAL */}

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

              {/* MODEL 95% INTERVAL */}

              <Area
                type="linear"
                name={`${config.name} 95% interval`}
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

              {/* RTE FORECAST */}

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

              {/* MODEL FORECAST */}

              <Line
                type="linear"
                name={`${config.name} forecast`}
                dataKey="prediction"
                stroke={config.color}
                strokeWidth={2.7}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />

            </ComposedChart>

          </ResponsiveContainer>
        </div>

      </section>

      {/* MATHEMATICAL SPECIFICATION */}

      <details className="sarima-method-accordion">

        <summary>
          <span>Mathematical specification</span>
          <span
            className="sarima-method-chevron"
            aria-hidden="true"
          />
        </summary>

        <div className="sarima-method-accordion-content">
            <section className="sarima-card sarima-knowledge">
                {model === "lightgbm" ? (
                <LightGBMMathematics />
                ) : (
                <MTSTMathematics />
                )}
            </section>
        </div>

      </details>

    </div>
  );
}
