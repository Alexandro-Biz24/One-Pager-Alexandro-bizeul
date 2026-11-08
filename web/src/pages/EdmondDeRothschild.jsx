import katex from "katex"
import "katex/dist/katex.min.css"
import "./Competitions.css"

function Equation({ children }) {
  const html = katex.renderToString(children, {
    displayMode: true,
    throwOnError: true,
    trust: false,
  })

  return (
    <div
      className="competition-equation"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const CONTENTS = [
  ["edr-context", "Context and objective"],
  ["edr-data", "Organising the information"],
  ["edr-score", "An interpretable composite score"],
  ["edr-case", "Reading the market environment"],
  ["edr-allocation", "Factor-based defensive allocation"],
]

export default function EdmondDeRothschild() {
  return (
    <main className="competition-page">
      <div className="competition-hero">
        <p className="competition-eyebrow">
          February–April 2024 · Quantitative Research Hackathon
        </p>

        <h1>Edmond de Rothschild</h1>

        <p className="competition-lead">
          Connecting macroeconomic events, fund dynamics
          and portfolio resilience
        </p>

        <div className="competition-facts">
          <div>
            <span>Result</span>
            <strong>1st place</strong>
          </div>

          <div>
            <span>Academic stage</span>
            <strong>Second-year bachelor</strong>
          </div>

          <div>
            <span>Research focus</span>
            <strong>Fund flows and AUM</strong>
          </div>

          <div>
            <span>Professional outcome</span>
            <strong>First internship offer</strong>
          </div>
        </div>

        <p className="competition-abstract">
          During my second year of bachelor studies,
          I participated in a research hackathon focused
          on the Sustainable Equity fund. The project
          organised internal fund information,
          macroeconomic releases and news into an
          interpretable composite indicator. We used
          this framework to investigate changes in
          assets under management and client flows,
          then proposed a defensive allocation approach
          based on the factor sensitivities of existing
          portfolio holdings.
        </p>

        <p className="competition-note">
          The project won first place and led to my
          first internship at Edmond de Rothschild.
          This page presents the analytical approach
          and its portfolio implications.
        </p>
      </div>

      <nav
        className="competition-contents"
        aria-label="On this page"
      >
        {CONTENTS.map(([id, title], index) => (
          <a key={id} href={`#${id}`}>
            <span>
              {String(index + 1).padStart(2, "0")}
            </span>
            {title}
          </a>
        ))}
      </nav>

      <section
        className="competition-section"
        id="edr-context"
      >
        <p className="competition-section-number">01</p>
        <h2>Context and objective</h2>

        <p>
          The starting question was practical — which
          internal and external factors could help
          interpret fundraising conditions for the
          Sustainable Equity fund?
        </p>

        <p>
          The investigation connected three perspectives.
          The first concerned the market environment.
          The second concerned the fund’s performance
          and assets under management. The third
          concerned investor subscriptions and
          redemptions.
        </p>

        <p>
          Changes in AUM can reflect both investment
          performance and client flows. Reading these
          dimensions together helped structure the
          investigation and identify periods requiring
          closer analysis.
        </p>

        <div className="competition-callout">
          <strong>Project objective</strong>
          <p>
            Build an interpretable view of the fund’s
            environment, identify the events contributing
            to adverse periods and translate those
            observations into portfolio questions.
          </p>
        </div>
      </section>

      <section
        className="competition-section"
        id="edr-data"
      >
        <p className="competition-section-number">02</p>
        <h2>Organising the information</h2>

        <h3>Structuring the business question</h3>

        <p>
          We organised potential drivers into internal
          and external categories. This decomposition
          provided a consistent structure for gathering
          information and comparing explanations.
        </p>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Internal and external research factors"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Internal factors</th>
                <th scope="col">External factors</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Fund performance</td>
                <td>Macroeconomic conditions</td>
              </tr>
              <tr>
                <td>Management team</td>
                <td>Market and sector dynamics</td>
              </tr>
              <tr>
                <td>Management fees</td>
                <td>Regulation and taxation</td>
              </tr>
              <tr>
                <td>Portfolio characteristics</td>
                <td>Competition and investor confidence</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Building an event table</h3>

        <p>
          The analysis covered approximately 3,000
          observations across 60 event types. Internal
          fund information was combined with economic
          releases and news, including information
          collected through Trading Economics.
        </p>

        <p>
          Each event was associated with a date,
          a directional interpretation and an importance
          weight. Quantitative releases also included
          current and previous values where available.
        </p>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Event dataset structure"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Event and date</td>
                <td>
                  Identify the information and align it
                  with the relevant period
                </td>
              </tr>
              <tr>
                <td>Current and previous values</td>
                <td>
                  Describe the change in quantitative
                  indicators
                </td>
              </tr>
              <tr>
                <td>Directional score</td>
                <td>
                  Encode the interpretation of the event
                  for the fund environment
                </td>
              </tr>
              <tr>
                <td>Importance weight</td>
                <td>
                  Express the relative importance assigned
                  to the event
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          A favourable or adverse interpretation depends
          on the economic context and the fund’s
          exposures. A rise in an indicator therefore
          needs an explicit interpretation before it
          enters the composite score.
        </p>
      </section>

      <section
        className="competition-section"
        id="edr-score"
      >
        <p className="competition-section-number">03</p>
        <h2>An interpretable composite score</h2>

        <h3>Combining event contributions</h3>

        <p>
          The framework combines the signed contributions
          of internal and external events. A compact
          representation of the weighted scoring
          approach is
        </p>

        <Equation>
          {String.raw`
            S_t=\sum_{j\in\mathcal E_t}w_j s_j.
          `}
        </Equation>

        <p>
          The set E contains the events assigned to
          period t. Each event receives a directional
          score s and an importance weight w.
        </p>

        <p>
          Keeping individual contributions visible makes
          the aggregate interpretable. An adverse score
          can be traced back to the events and factor
          groups that contributed to it.
        </p>

        <h3>Standardising the score</h3>

        <Equation>
          {String.raw`
            Z_t=\frac{S_t-\mu_S}{\sigma_S},
            \qquad \sigma_S>0.
          `}
        </Equation>

        <p>
          The reference mean and standard deviation
          express the composite score on a common scale.
          Positive values describe a more favourable
          scored environment relative to the reference.
          Negative values describe a more adverse one.
        </p>

        <div className="competition-callout">
          <strong>Interpreting the indicator</strong>
          <p>
            A score of −2 represents a composite reading
            two reference standard deviations below its
            mean. Its interpretation depends on the event
            coding, assigned weights and reference period.
          </p>
        </div>

        <p>
          The framework can be applied to different
          funds, with event interpretation and portfolio
          exposure analysis adapted to each investment
          universe.
        </p>
      </section>

      <section
        className="competition-section"
        id="edr-case"
      >
        <p className="competition-section-number">04</p>
        <h2>Reading the market environment</h2>

        <h3>Connecting the score with fund dynamics</h3>

        <p>
          The presentation compared the composite
          indicator with monthly AUM and highlighted
          periods of deterioration and recovery.
          The purpose was to connect observed fund
          dynamics with an organised view of the
          surrounding events.
        </p>

        <h3>January–March 2022</h3>

        <p>
          The case study examined January to March
          2022 in greater detail. Inflation, the
          Westpac index and PMI appeared among the
          negative contributions highlighted in the
          presentation. Client outflows were examined
          alongside this adverse environment.
        </p>

        <p>
          This reading provided a structured account
          of the episode and a way to discuss the
          potential transmission from macroeconomic
          conditions to portfolio performance and
          investor behaviour.
        </p>

        <p>
          The analysis was exploratory. The observed
          association between the indicator, AUM and
          flows supports interpretation of the episode,
          while causal attribution requires a separate
          identification framework.
        </p>
      </section>

      <section
        className="competition-section"
        id="edr-allocation"
      >
        <p className="competition-section-number">05</p>
        <h2>Factor-based defensive allocation</h2>

        <h3>From the aggregate signal to individual holdings</h3>

        <p>
          Portfolio holdings can respond differently
          to the same environment. When the composite
          indicator deteriorates, some assets may
          remain resilient or move in the opposite
          direction.
        </p>

        <p>
          The proposed allocation response was to
          identify these holdings within the existing
          portfolio and increase their relative weight
          during strongly adverse readings.
        </p>

        <h3>Defining the exposure</h3>

        <p>
          A simple descriptive regression relates an
          asset’s return to the composite indicator
        </p>

        <Equation>
          {String.raw`
            r_{i,t}
            =\alpha_i+\beta_{i,Z}Z_t+\epsilon_{i,t}.
          `}
        </Equation>

        <p>
          With favourable conditions coded as positive
          values of Z, a negative beta means that a
          decrease in the indicator contributes
          positively to the fitted return, all else
          equal.
        </p>

        <Equation>
          {String.raw`
            \beta_{i,Z}<0,\quad Z_t<0
            \quad\Longrightarrow\quad
            \beta_{i,Z}Z_t>0.
          `}
        </Equation>

        <p>
          This exposure provides a way to identify
          candidates for defensive reallocation.
          It describes an estimated relationship whose
          usefulness depends on its stability and the
          economic characteristics of the holding.
        </p>

        <h3>Examining individual components</h3>

        <p>
          A holding may respond to a specific component
          more strongly than to the aggregate indicator.
          A factor-level representation makes these
          sensitivities explicit
        </p>

        <Equation>
          {String.raw`
            r_{i,t}
            =\alpha_i+
            \sum_{k=1}^{K}\beta_{i,k}F_{k,t}
            +\epsilon_{i,t}.
          `}
        </Equation>

        <p>
          The sign of each beta is interpreted against
          the coding of its factor. A negative beta to
          the raw inflation rate means that higher
          inflation contributes negatively to the fitted
          return. A negatively coded inflation score
          reverses that sign convention.
        </p>

        <div className="competition-callout">
          <strong>Allocation principle</strong>
          <p>
            When the composite indicator signals a
            strongly adverse environment, identify the
            main negative contributions and favour
            existing holdings whose estimated exposures
            provide resilience to those conditions.
          </p>
        </div>

        <h3>Practical decision process</h3>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Defensive allocation process"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Portfolio question</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Read the composite indicator</td>
                <td>
                  Is the environment sufficiently adverse
                  to justify reviewing the allocation?
                </td>
              </tr>
              <tr>
                <td>Inspect factor contributions</td>
                <td>
                  Which events or components explain
                  the adverse reading?
                </td>
              </tr>
              <tr>
                <td>Compare existing holdings</td>
                <td>
                  Which holdings have exposures consistent
                  with resilience to those conditions?
                </td>
              </tr>
              <tr>
                <td>Review portfolio weights</td>
                <td>
                  Can allocation shift towards those
                  holdings within the fund’s mandate?
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Getlink was used in the presentation as an
          example for investigating holdings that
          diverged from the adverse aggregate environment.
          The recommendation was to connect the
          indicator with security-level analysis before
          considering changes in portfolio weights.
        </p>

        <p>
          The objective was to improve portfolio
          resilience while preserving the fund’s
          investment constraints, diversification and
          liquidity requirements.
        </p>
      </section>
    </main>
  )
}