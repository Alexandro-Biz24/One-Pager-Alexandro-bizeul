
import { useEffect, useState } from "react";

import FeatureEngineeringSection from "./FeatureEngineeringSection";
import SarimaModelSection from "./SarimaModelSection";
import ForecastModelSection from "./ForecastModelSection";
import StatisticalTestsSection from "./StatisticalTestsSection";

import "./ModelLayoutOverrides.css";

const MODELS = [
  {
    id: "statistical",
    label: "Statistical",
    apiModel: "sarima",
  },
  {
    id: "ml",
    label: "Machine learning",
    apiModel: "lightgbm",
  },
  {
    id: "dl",
    label: "Deep learning",
    apiModel: "mtst",
  },
];

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function parisDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(dateString, days) {
  if (!dateString) return null;

  const date = new Date(`${dateString}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export default function Page() {
  const [model, setModel] = useState("statistical");

  const [mode, setMode] = useState("today");

  const [start, setStart] = useState(() =>
    shiftDate(parisDate(), -7)
  );

  const [end, setEnd] = useState(() => parisDate());

  const [latestInfo, setLatestInfo] = useState(null);
  const [latestError, setLatestError] = useState("");

  const current =
    MODELS.find((item) => item.id === model) || MODELS[0];

  const apiModel = current.apiModel;

  const latestDay =
    latestInfo?.model === apiModel
      ? latestInfo.day
      : null;

  useEffect(() => {
    const controller = new AbortController();

    async function fetchLatestDay() {
      setLatestError("");

      try {
        const params = new URLSearchParams({
          model: apiModel,
        });

        const response = await fetch(
          `${API_BASE}/timeseries/latest-day?${params}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `No available ${apiModel} forecast`
          );
        }

        const json = await response.json();

        if (!controller.signal.aborted) {
          setLatestInfo({
            model: apiModel,
            day: json.latest_day,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLatestError(error.message);
        }
      }
    }

    fetchLatestDay();

    return () => controller.abort();
  }, [apiModel]);

  const commonProps = {
    mode,
    setMode,
    start,
    setStart,
    end,
    setEnd,
    latestDay,
  };

  return (
    <div className="model-screen">

      <div className="model-selection-row">
        <span className="model-selection-label" id="forecast-model-label">Select a forecasting model:</span>
        <div
          className="model-switch"
          role="group"
          aria-labelledby="forecast-model-label"
        >
        {MODELS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === model}
            onClick={() => setModel(item.id)}
          >
            {item.label}
          </button>
        ))}
        </div>
      </div>

      <div className="model-cols">

        {/* COLUMN 1 — SHARED FEATURES */}

        <section>
          <h2>Feature engineering</h2>

          <FeatureEngineeringSection />
        </section>

        {/* COLUMN 2 — MODEL FORECAST */}

        <section>
          <h2>{current.label} model</h2>

          {model === "statistical" ? (
            <SarimaModelSection
              {...commonProps}
            />
          ) : (
            <ForecastModelSection
              key={apiModel}
              model={apiModel}
              {...commonProps}
            />
          )}

          {mode === "today" && latestError && (
            <p className="sarima-error">
              {latestError}
            </p>
          )}
        </section>

        {/* COLUMN 3 — SHARED STATISTICAL TESTS */}

        <section>
          <h2>Statistical tests</h2>

          <StatisticalTestsSection
            key={apiModel}
            model={apiModel}
            mode={mode}
            start={start}
            end={end}
          />
        </section>

      </div>
    </div>
  );
}
