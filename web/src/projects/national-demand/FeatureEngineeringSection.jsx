
import "./FeatureEngineeringSection.css";

import "./FeatureEngineeringSection.css";

const PROJECT_PAPER = "/papers/national-demand-note";
// Change to true after adding the report figure in /public.
const SHOW_REPORT_FIGURE = true;

const modelFeatures = [
  ["target_hour", "Civil hour of the forecast target"],
  ["target_day_of_week", "Day of week in Europe/Paris"],
  ["target_month", "Calendar month"],
  ["prediction_d1", "RTE day-ahead forecast for the target"],
  ["rte_error_lag_48h", "Observed RTE error, 48 hours earlier"],
  ["hdd_48h", "Heating degree signal from lagged temperature"],
  ["cdd_48h", "Cooling degree signal from lagged temperature"],
  ["calendar_amplify_ewa", "Weighted calendar activity score"],
];

function FeatureAccordion({ number, title, children, defaultOpen = false }) {
    return (
      <details className="fe-accordion" open={defaultOpen}>
        <summary className="fe-accordion-trigger">
          <span className="fe-heading-number">{number}</span>
          <span className="fe-accordion-title">{title}</span>
          <span className="fe-accordion-chevron" aria-hidden="true" />
        </summary>
  
        <div className="fe-accordion-content">
          {children}
        </div>
      </details>
    );
  }

function ForecastProtocol() {
  return (
    <div className="fe-forecast-figure">
      <div className="fe-protocol-row">
        <div className="fe-protocol-box fe-protocol-dark">
          <strong>Day J</strong>
          <small>13:00 Paris</small>
        </div>

        <span className="fe-connector" aria-hidden="true">→</span>

        <div className="fe-protocol-box">
          <strong>Available data</strong>
          <small>History + RTE</small>
        </div>

        <span className="fe-connector" aria-hidden="true">→</span>

        <div className="fe-protocol-box fe-protocol-dark">
          <strong>Day J+1</strong>
          <small>Hourly load</small>
        </div>
      </div>

      <p className="fe-figure-caption">
        Daily-step forecasting. Each day, the same model parameters
        generate the following day's demand profile.
      </p>
    </div>
  );
}

function ClockDiagram() {
  return (
    <div className="fe-clock-figure">
      <div className="fe-clock-row">
        <div className="fe-clock-label">
          <span>WINTER</span>
          <strong>19:00 Paris</strong>
        </div>
        <span className="fe-clock-line" />
        <div className="fe-clock-result">18:00 UTC</div>
      </div>

      <div className="fe-clock-row">
        <div className="fe-clock-label">
          <span>SUMMER</span>
          <strong>19:00 Paris</strong>
        </div>
        <span className="fe-clock-line" />
        <div className="fe-clock-result">17:00 UTC</div>
      </div>

      <div className="fe-clock-note">
        Same civil activity. Different UTC coordinates.
      </div>
    </div>
  );
}

function FeaturePipeline() {
  return (
    <div className="fe-pipeline">
      <div className="fe-pipeline-block">
        <span className="fe-step-index">01</span>
        <div>
          <strong>Hourly sources</strong>
          <small>Observed load · Temperature · RTE D−1</small>
        </div>
      </div>

      <div className="fe-pipeline-arrow">↓</div>

      <div className="fe-pipeline-block">
        <span className="fe-step-index">02</span>
        <div>
          <strong>UTC-aligned history</strong>
          <small>Continuous hourly index · 48h / 168h lags</small>
        </div>
      </div>

      <div className="fe-pipeline-arrow">↓</div>

      <div className="fe-pipeline-block">
        <span className="fe-step-index">03</span>
        <div>
          <strong>Feature transformation</strong>
          <small>RTE error · Thermal effects · Civil calendar</small>
        </div>
      </div>

      <div className="fe-pipeline-arrow">↓</div>

      <div className="fe-pipeline-block fe-pipeline-output">
        <span className="fe-step-index">04</span>
        <div>
          <strong>Frozen target features</strong>
          <small>Stored once in Neon · Reused by ML / DL</small>
        </div>
      </div>
    </div>
  );
}

function FeatureFormula({ title, formula, description }) {
  return (
    <div className="fe-formula-card">
      <div className="fe-formula-title">{title}</div>
      <div className="fe-formula">{formula}</div>
      <p>{description}</p>
    </div>
  );
}

function ModelInputs() {
  return (
    <div className="fe-models">
      <div className="fe-model">
        <div className="fe-model-head">
          <strong>SARIMA</strong>
          <span>Univariate</span>
        </div>
        <p>
          Historical load only. Parameters are fixed after training;
          the filtering state is refreshed from recent observations.
        </p>
      </div>

      <div className="fe-model">
        <div className="fe-model-head">
          <strong>LightGBM</strong>
          <span>8 features / hour</span>
        </div>
        <p>
          Tabular residual forecasting: learn the correction
          to the RTE day-ahead baseline.
        </p>
      </div>

      <a
        className="fe-model fe-model-link"
        href={PROJECT_PAPER}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open the MTST research paper"
      >
        <div className="fe-model-head">
          <strong>MTST</strong>
          <span>24 × 8 tensor ↗</span>
        </div>
        <p>
          The same eight features are organized as a daily
          sequence and processed with multi-resolution attention.
        </p>
        <small>Read the forecasting methodology ↗</small>
      </a>
    </div>
  );
}

export default function FeatureEngineeringSection() {
    return (
      <div className="fe-section">
        
  
        {/* ==========================================
            01 — FORECASTING PROTOCOL
            ========================================== */}
  
        <FeatureAccordion 
            number="01" 
            title="Forecasting protocol" 
            defaultOpen 
        >
          <ForecastProtocol />
  
          <p>
            The operational origin is{" "}
            <strong>day J at 13:00 Europe/Paris</strong>.
            We forecast the civil hours of day J+1 using
            previously available observations and RTE's
            day-ahead demand forecast.
          </p>
  
          <div className="fe-note">
            <strong>Information boundary</strong>
            <span>
              Future observed load and temperature are never used
              as target-day predictors. The historical lag features
              rely on observations at least 48 hours earlier.
            </span>
          </div>
        </FeatureAccordion>
  
        {/* ==========================================
            02 — TWO CLOCKS
            ========================================== */}
  
        <FeatureAccordion number="02" title="Two clocks, one demand series">
          <a
            href="/papers/national-demand-note"
            className="fe-diagram-link"
            title="Read the complete forecasting methodology"
          >
            <ClockDiagram />
            <span>Read the full methodology</span>
          </a>
  
          <p>
            Electricity demand follows human activity, which is
            synchronized to civil time. A fixed UTC hour therefore
            represents different local activities across seasons.
          </p>
  
          <div className="fe-clock-comparison">
            <div>
              <strong>UTC</strong>
              <span>
                Storage · Unique timestamps · Elapsed-hour lags
              </span>
            </div>
  
            <div>
              <strong>Europe/Paris</strong>
              <span>
                Calendar · Target days · Civil-hour alignment
              </span>
            </div>
          </div>
  
          <figure className="fe-report-figure">
            <a
              href="/images/timeseries/dual-clock-demand.png"
              target="_blank"
              rel="noopener noreferrer"
              title="Enlarge the dual-clock demand figure"
            >
              <img
                src="/images/timeseries/dual-clock-demand.png"
                alt="Winter and summer demand profiles compared using UTC and Paris civil time."
                loading="lazy"
              />
            </a>
  
            <figcaption>
              Normalized hourly demand profiles, working days,
              2024. UTC versus Europe/Paris alignment.
              Select the figure to enlarge.
            </figcaption>
          </figure>
        </FeatureAccordion>
  
        {/* ==========================================
            03 — TEMPORAL INTEGRITY AND DST
            ========================================== */}
  
        <FeatureAccordion number="03" title="Temporal integrity and DST">
          <div className="fe-dst-grid">
            <div className="fe-dst-card">
              <strong>March</strong>
              <span>23 civil hours</span>
  
              <div className="fe-hour-strip">
                <i>01</i>
                <i className="fe-hour-missing">02</i>
                <i>03</i>
                <i>04</i>
              </div>
  
              <small>Non-existent local 02:00 is excluded.</small>
            </div>
  
            <div className="fe-dst-card">
              <strong>October</strong>
              <span>25 civil hours</span>
  
              <div className="fe-hour-strip">
                <i>01</i>
                <i className="fe-hour-excluded">02a</i>
                <i>02b</i>
                <i>03</i>
              </div>
  
              <small>
                First repeated 02:00 excluded from scoring.
              </small>
            </div>
          </div>
  
          <p>
            The database retains UTC timestamps, including both
            occurrences of the autumn transition hour. Model outputs
            and evaluations follow a common convention: 23 valid
            hours in March, 24 in October, and 24 on ordinary days.
          </p>
  
          <div className="fe-note">
            <strong>Missing observations</strong>
            <span>
              Raw missing values remain identifiable in Neon.
              Limited temporary interpolation can support SARIMA
              continuity, but interpolated targets are not used
              as observed ground truth in evaluation.
            </span>
          </div>
        </FeatureAccordion>
  
        {/* ==========================================
            04 — FEATURE CONSTRUCTION
            ========================================== */}
  
        <FeatureAccordion number="04" title="Feature construction">
          <FeaturePipeline />
  
          <div className="fe-formulas">
            <FeatureFormula
              title="Elapsed-hour lags"
              formula="L₄₈(t) = Load(t − 48h)"
              description="Short-term persistence; a 168-hour lag also captures weekly structure."
            />
  
            <FeatureFormula
              title="RTE forecast error memory"
              formula="e₄₈(t) = Load(t − 48h) − RTE(t − 48h)"
              description="Measures recent forecast bias without using the target observation."
            />
  
            <FeatureFormula
              title="Heating and cooling signals"
              formula="HDD = max(15 − T₄₈, 0)"
              description="CDD = max(T₄₈ − 22, 0). Both use lagged observed temperature."
            />
  
            <FeatureFormula
              title="Calendar amplification"
              formula="A = (8H + 4S + 2D + M) / 15"
              description="Weighted combination of hour (H), season (S), day (D), and month (M) activity scores."
            />
          </div>
        </FeatureAccordion>
  
        {/* ==========================================
            05 — FINAL MODEL INPUTS
            ========================================== */}
  
        <FeatureAccordion number="05" title="Final model inputs">
          <p>
            LightGBM and MTST consume the same eight frozen
            predictors for each target hour.
          </p>
  
          <div className="fe-feature-table-wrap">
            <table className="fe-feature-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Purpose</th>
                </tr>
              </thead>
  
              <tbody>
                {modelFeatures.map(([name, purpose]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
  
          <ModelInputs />
        </FeatureAccordion>
  
        
      </div>
    );
  }
