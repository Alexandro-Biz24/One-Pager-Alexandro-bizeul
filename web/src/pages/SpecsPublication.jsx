
import { useEffect } from "react"
import { Link } from "react-router-dom"
import katex from "katex"
import "katex/dist/katex.min.css"
import "./SpecsPublication.css"

const ZENODO_URL = "https://zenodo.org/records/17246723"

function Equation({ children }) {
  const html = katex.renderToString(children, {
    displayMode: true,
    throwOnError: false,
  })

  return (
    <div
      className="specs-equation"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function SpecsPublication() {
  useEffect(() => {
    document.title =
      "SPECS-Transformer — Alexandro Bizeul"
  }, [])

  return (
    <main className="specs-publication">

      <header className="specs-hero">
        <span className="specs-eyebrow">
          INDEPENDENT RESEARCH · 2025
        </span>

        <h1>SPECS-Transformer</h1>

        <p className="specs-subtitle">
          A Transformer Architecture for Volatility
          Forecasting with Signal-Spectrum Dynamics
        </p>

        <p className="specs-author">
          Alexandro Bizeul · September 2025
        </p>

        <div className="specs-actions">
          <Link
            to="/papers/specs-transformer"
            className="specs-action specs-action-primary"
          >
            Read the research paper
          </Link>

          <a
            href={ZENODO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="specs-action specs-action-secondary"
          >
            Official Zenodo repository
          </a>
        </div>
      </header>

      <section className="specs-intro">
        <span className="specs-kicker">ABSTRACT</span>

        <p>
          Forecasting financial volatility requires more
          than minimizing average prediction error: it
          demands sensitivity to abrupt market movements
          and accurate estimation of their magnitude.
          This research investigates successive neural
          architectures, from probabilistic autoencoders
          and recurrent networks to attention-based models.
          The resulting SPECS-Transformer combines
          sinusoidal positional encoding with
          signal-spectrum-aware optimization to improve
          the representation of volatility dynamics
          while reducing computational cost.
        </p>
      </section>

      <section className="specs-section">
        <span className="specs-kicker">
          01 / RESEARCH MOTIVATION
        </span>

        <h2>From academic foundations to financial research</h2>

        <p>
          Following my bachelor's degree, I wanted
          to apply the mathematical, statistical and
          computational methods I had studied to a
          domain that genuinely interested me:
          quantitative finance.
        </p>

        <p>
          Financial volatility provided a particularly
          relevant research problem. Unlike a smooth
          forecasting target, market volatility evolves
          through irregular regimes and sudden shocks.
          An apparently accurate model can still fail
          precisely when risk estimation matters most.
        </p>

        <p>
          I therefore approached this work as an
          independent investigation into model design,
          probabilistic learning and signal processing,
          rather than as a trading strategy or a
          short-term profit optimization exercise.
        </p>
      </section>

      <section className="specs-section">
        <span className="specs-kicker">
          02 / RESEARCH FRAMEWORK
        </span>

        <h2>Three stages of model development</h2>

        <div className="specs-stages">
          <article className="specs-stage">
            <span>01</span>
            <h3>Variational Autoencoders</h3>
            <p>
              Initial experiments with flat and LSTM-based
              VAEs explored probabilistic latent
              representations of financial time series.
              The objective was to extract information
              about volatility regimes from historical
              market features.
            </p>
          </article>

          <article className="specs-stage">
            <span>02</span>
            <h3>GRU-based forecasting</h3>
            <p>
              GRU-VAE architectures introduced direct
              forecasting objectives. Custom directional
              and Fourier-based losses were investigated
              to improve the identification of volatility
              movements and the calibration of their
              amplitude.
            </p>
          </article>

          <article className="specs-stage">
            <span>03</span>
            <h3>SPECS-Transformer</h3>
            <p>
              Attention-based forecasting replaced
              recurrence with Transformer encoders.
              The final experiments explored sinusoidal
              positional information alongside
              time-domain and spectral optimization
              to balance peak sensitivity, amplitude
              and computational efficiency.
            </p>
          </article>
        </div>
      </section>

      <section className="specs-section">
        <span className="specs-kicker">
          03 / MATHEMATICAL FOUNDATION
        </span>

        <h2>Learning volatility beyond pointwise error</h2>

        <p>
          The research investigates two complementary
          objectives: capturing volatility movements in
          the time domain and preserving relevant
          frequency-domain properties.
        </p>

        <div className="specs-math-grid">
          <article className="specs-math-card">
            <h3>Amplitude-sensitive forecasting</h3>

            <Equation>{String.raw`
              \mathcal{L}_{\mathrm{peak}}
              =
              \frac{1}{N}\sum_{t=1}^{N}
              w_t(y_t-\hat y_t)^2
            `}</Equation>

            <Equation>{String.raw`
              w_t
              =
              1+\alpha|y_t-\bar y|
            `}</Equation>

            <p>
              Larger deviations from average volatility
              receive greater weight, encouraging the
              model to pay attention to sharp movements.
            </p>
          </article>

          <article className="specs-math-card">
            <h3>Spectral alignment</h3>

            <Equation>{String.raw`
              \mathcal{L}_{\mathrm{FFT}}
              =
              \operatorname{MSE}
              \left(
              |\mathcal F(y)|,
              |\mathcal F(\hat y)|
              \right)
            `}</Equation>

            <p>
              A Fourier-domain penalty compares the
              magnitude spectra of observed and
              predicted volatility, complementing the
              time-domain prediction objective.
            </p>
          </article>
        </div>

        <p className="specs-method-note">
          The paper also investigates fixed sinusoidal
          positional encodings for the Transformer.
          The equations above describe the custom
          losses explored during the research.
        </p>
      </section>

      <section className="specs-section">
        <span className="specs-kicker">
          04 / REPORTED RESULTS
        </span>

        <h2>What the experiments revealed</h2>

        <div className="specs-results">
          <article className="specs-result-primary">
            <span className="specs-result-number">
              95.6%
            </span>

            <h3>Reported reduction in computation time</h3>

            <p>
              A 95.6% reduction
              in computation time for the final
              approach compared with the earlier
              Transformer experiment on the
              same dataset.
            </p>
          </article>

          <article className="specs-result-secondary">
            <h3>Peak detection</h3>
            <p>
              Direction-aware objectives improved the
              detection of volatility spikes, but
              introduced challenges in predicted
              amplitude.
            </p>
          </article>

          <article className="specs-result-secondary">
            <h3>Amplitude calibration</h3>
            <p>
              Fourier-based optimization improved
              spectral alignment and amplitude
              representation, while sometimes making
              peak detection less stable.
            </p>
          </article>

          <article className="specs-result-secondary">
            <h3>Final architectural trade-off</h3>
            <p>
              The sinusoidal Transformer experiment
              provided a more balanced representation
              of amplitude and volatility peaks,
              with substantially shorter training time
              in the reported experiments.
            </p>
          </article>
        </div>

        <p className="specs-method-note">
          These observations summarize the experiments
          presented in the research paper. They should
          not be interpreted as independently verified
          live-trading performance.
        </p>
      </section>

      <section className="specs-repository">
        <div>
          <span className="specs-kicker">
            OFFICIAL RESEARCH RECORD
          </span>

          <h2>Publication on Zenodo</h2>

          <p>
            Access the deposited research document
            and its official repository record.
          </p>

          <p className="specs-record-id">
            Zenodo Record 17246723
          </p>
        </div>

        <a
          href={ZENODO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="specs-action specs-action-primary"
        >
          View on Zenodo
        </a>
      </section>

    </main>
  )
}
