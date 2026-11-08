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
  ["imc-context", "Competition framework"],
  ["imc-spread", "Spread mean reversion"],
  ["imc-volatility", "Implied volatility mean reversion"],
  ["imc-baskets", "Basket vs. synthetic"],
  ["imc-execution", "Execution and position limits"],
  ["imc-references", "References"],
]

export default function ImcProsperity() {
  return (
    <main className="competition-page">
      <div className="competition-hero">
        <p className="competition-eyebrow">
          April 2025 · Quantitative Trading Competition
        </p>

        <h1>IMC — Prosperity 3</h1>

        <p className="competition-lead">
          Statistical relative value across linked
          products, option volatility and synthetic baskets
        </p>

        <div className="competition-facts">
          <div>
            <span>Result</span>
            <strong>Top 1%</strong>
          </div>

          <div>
            <span>Competition dates</span>
            <strong>7–22 April 2025</strong>
          </div>

          <div>
            <span>Format</span>
            <strong>5 trading rounds</strong>
          </div>

          <div>
            <span>Trading environment</span>
            <strong>Simulated order books</strong>
          </div>
        </div>

        <p className="competition-abstract">
          Prosperity combines algorithmic and manual
          trading challenges in a simulated economy.
          Fictional products reproduce mechanisms found
          in financial markets, including linked assets,
          baskets and options. The approaches discussed
          here express three relative-value hypotheses —
          convergence of a statistical spread, reversion
          of implied volatility and convergence between
          a basket and its synthetic composition.
        </p>

        <p className="competition-note">
          Methodological reconstruction of the approaches.
          Instrument definitions are documented in public
          competition materials and participant write-ups.
          Parameters and the optional ML extension describe
          a reproducible formulation. The statistical pair
          is represented generically pending identification
          of the original instruments.
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
        id="imc-context"
      >
        <p className="competition-section-number">01</p>
        <h2>Competition framework</h2>

        <p>
          IMC organised Prosperity 3 from 7 to 22 April
          2025. Across five rounds, participants developed
          trading algorithms and completed manual
          challenges. Performance was expressed in
          SeaShells, the simulated economy’s currency.
        </p>

        <p>
          The algorithmic environment exposed order books,
          trades and current positions. New rounds
          introduced additional instruments and information.
          Strategies had to convert observations into
          executable orders while respecting instrument-level
          position limits.
        </p>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Relevant competition instruments"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Instrument group</th>
                <th scope="col">Economic mechanism</th>
                <th scope="col">Relevant approach</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Related tradable products</td>
                <td>Empirically estimated price relationship</td>
                <td>Statistical spread trading</td>
              </tr>
              <tr>
                <td>Volcanic Rock and its vouchers</td>
                <td>Underlying and European-style calls</td>
                <td>Implied volatility trading</td>
              </tr>
              <tr>
                <td>Picnic Baskets and their components</td>
                <td>Known weighted composition</td>
                <td>Basket vs. synthetic trading</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          For each product, the mid-price is the reference
          for feature construction. Execution uses the bid
          or ask and the quantities available at those
          prices.
        </p>

        <Equation>
          {String.raw`
            m_{i,t}=\frac{a_{i,t}+b_{i,t}}{2},
            \qquad
            c_{i,t}=a_{i,t}-b_{i,t}.
          `}
        </Equation>

        <p>
          Every decision uses information available at
          that timestamp. Rolling estimates are updated
          sequentially, with sufficient historical
          observations required before generating a signal.
        </p>
      </section>

      <section
        className="competition-section"
        id="imc-spread"
      >
        <p className="competition-section-number">02</p>
        <h2>Spread Mean Reversion</h2>

        <h3>Economic intuition</h3>

        <p>
          Two related instruments may share an economic
          driver while experiencing temporary differences
          in trading pressure. The trading hypothesis is
          that an unusually large deviation from their
          estimated relationship will subsequently narrow.
        </p>

        <p>
          A shared theme or high return correlation
          motivates investigation. The relevant property
          for this strategy is the behaviour of the
          resulting spread, including the stability of its
          reference level and its tendency to revert.
        </p>

        <h3>Estimating the relationship</h3>

        <p>
          Consider two products A and B, with mid-prices
          P superscript A and P superscript B. Estimate
          an intercept and a positive hedge ratio from
          a trailing window of N observations ending
          before the current timestamp.
        </p>

        <Equation>
          {String.raw`
            (\hat\alpha_t,\hat\beta_t)
            =
            \underset{\alpha,\beta}{\operatorname{argmin}}
            \sum_{u=t-N}^{t-1}
            \left(P_u^A-\alpha-\beta P_u^B\right)^2.
          `}
        </Equation>

        <p>
          The current spread is the residual relative to
          that fitted relationship
        </p>

        <Equation>
          {String.raw`
            s_t=P_t^A-\hat\alpha_t-\hat\beta_tP_t^B.
          `}
        </Equation>

        <p>
          In this price-level formulation, the hedge ratio
          specifies units of B per unit of A. It can differ
          substantially from one. A market beta close to
          one would describe a different relationship.
        </p>

        <p>
          When the individual price series are integrated,
          cointegration provides a framework for checking
          whether a fixed linear combination is stationary.
          Re-estimating the hedge ratio alone does not
          establish that the spread is mean-reverting.
        </p>

        <h3>Standardising the deviation</h3>

        <p>
          Using the current fitted coefficients, construct
          historical residuals over the estimation window.
          Their mean and standard deviation define the
          reference used for the current decision.
        </p>

        <Equation>
          {String.raw`
            e_{u\mid t}
            =P_u^A-\hat\alpha_t-\hat\beta_tP_u^B,
            \qquad u=t-N,\ldots,t-1.
          `}
        </Equation>

        <Equation>
          {String.raw`
            \mu_{s,t}
            =\frac{1}{N}\sum_{u=t-N}^{t-1}e_{u\mid t},
            \qquad
            \sigma_{s,t}^2
            =\frac{1}{N-1}
            \sum_{u=t-N}^{t-1}
            (e_{u\mid t}-\mu_{s,t})^2.
          `}
        </Equation>

        <Equation>
          {String.raw`
            z_t=
            \frac{s_t-\mu_{s,t}}
            {\max(\sigma_{s,t},\varepsilon)},
            \qquad \varepsilon>0.
          `}
        </Equation>

        <h3>Entry and exit rules</h3>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Spread trading decisions"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Condition</th>
                <th scope="col">Interpretation</th>
                <th scope="col">Action for a new position</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>z exceeds the positive entry threshold</td>
                <td>A is relatively expensive</td>
                <td>Sell A and buy beta units of B</td>
              </tr>
              <tr>
                <td>z falls below the negative entry threshold</td>
                <td>A is relatively cheap</td>
                <td>Buy A and sell beta units of B</td>
              </tr>
              <tr>
                <td>z remains inside the entry band</td>
                <td>Deviation is insufficient</td>
                <td>Remain flat</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Equation>
          {String.raw`
            0\leq z_{\mathrm{exit}}<z_{\mathrm{entry}}.
          `}
        </Equation>

        <div className="competition-callout">
          <strong>Interpreting the thresholds</strong>
          <p>
            An illustrative entry threshold of 2 requires
            a deviation of two estimated residual standard
            deviations. A smaller exit threshold, such as
            0.5, closes the position after substantial
            convergence. Separate entry and exit bands
            reduce repeated switching near a single level.
          </p>
        </div>

        <p>
          A position also needs a maximum holding period
          and an adverse-move limit. These rules bound
          exposure when the relationship changes or
          convergence takes longer than expected.
        </p>

        <p>
          For a fixed hedge ratio during the holding
          period, the marked P&amp;L of one long-spread
          unit is
        </p>

        <Equation>
          {String.raw`
            \Pi_{t,u}
            =
            (P_u^A-P_t^A)
            -\hat\beta_t(P_u^B-P_t^B)
            -\mathrm{Costs}_{t,u}.
          `}
        </Equation>

        <h3>Optional ML entry filter</h3>

        <p>
          A proposed extension uses a classifier to
          estimate whether a threshold-based entry will
          reach its convergence exit before its
          adverse-move limit or maximum holding period.
          Inputs can include the current z-score,
          recent spread changes, volatility, book
          imbalance and executable spreads.
        </p>

        <Equation>
          {String.raw`
            p_t
            =\Pr(Y_t=1\mid X_t)
            =\frac{1}
            {1+\exp[-(\theta_0+\theta^\top X_t)]}.
          `}
        </Equation>

        <p>
          Here Y equals one when the specified convergence
          exit occurs first. An entry is accepted only
          when the estimated probability exceeds a chosen
          threshold. That threshold must account for the
          sizes of potential gains, losses and execution
          costs.
        </p>

        <p>
          Training uses only past entries whose outcomes
          are already known at the current timestamp.
          The ML filter is an extension of the reconstructed
          framework.
        </p>
      </section>

      <section
        className="competition-section"
        id="imc-volatility"
      >
        <p className="competition-section-number">03</p>
        <h2>Implied Volatility Mean Reversion</h2>

        <h3>Instrument structure</h3>

        <p>
          Round 3 introduced Volcanic Rock and five
          Volcanic Rock Vouchers. The vouchers behaved
          as European-style calls with strikes of
          9,500, 9,750, 10,000, 10,250 and 10,500,
          sharing an expiry.
        </p>

        <p>
          The proposed formulation monitors individual
          contracts, particularly those with sufficient
          sensitivity to volatility to support stable
          implied-volatility estimation.
        </p>

        <h3>Recovering implied volatility</h3>

        <p>
          Let S be the underlying price, K the strike and
          tau the remaining time to expiry. With zero
          interest and carry as modelling assumptions,
          the Black–Scholes call value is
        </p>

        <Equation>
          {String.raw`
            C_{\mathrm{BS}}(S,K,\tau,\sigma)
            =S\Phi(d_1)-K\Phi(d_2).
          `}
        </Equation>

        <Equation>
          {String.raw`
            d_1=
            \frac{\log(S/K)+\tfrac12\sigma^2\tau}
            {\sigma\sqrt{\tau}},
            \qquad
            d_2=d_1-\sigma\sqrt{\tau}.
          `}
        </Equation>

        <p>
          Phi denotes the standard normal cumulative
          distribution function. Implied volatility is
          recovered by numerically solving
        </p>

        <Equation>
          {String.raw`
            C_{\mathrm{BS}}
            (S_t,K,\tau_t,\hat\sigma_t^{\mathrm{IV}})
            -C_t^{\mathrm{mid}}=0.
          `}
        </Equation>

        <p>
          A bracketed root solver such as bisection
          provides a stable numerical inversion. The
          option price must satisfy the model’s admissible
          bounds, and a bracket containing a root must
          exist.
        </p>

        <Equation>
          {String.raw`
            \max(S_t-K,0)
            <C_t^{\mathrm{mid}}<S_t.
          `}
        </Equation>

        <p>
          Remaining time and volatility must use consistent
          time units. Low-vega contracts require particular
          care because small quote changes can produce
          large changes in recovered volatility.
        </p>

        <h3>Reference volatility and signal</h3>

        <p>
          The hypothesis is that deviations of implied
          volatility from a local reference will narrow.
          A simple reference is an exponentially weighted
          average of earlier valid observations.
        </p>

        <Equation>
          {String.raw`
            \bar\sigma_t
            =(1-\lambda)\bar\sigma_{t-1}
            +\lambda\hat\sigma_{t-1}^{\mathrm{IV}},
            \qquad 0<\lambda\leq1.
          `}
        </Equation>

        <Equation>
          {String.raw`
            z_t^{\mathrm{IV}}
            =
            \frac{\hat\sigma_t^{\mathrm{IV}}-\bar\sigma_t}
            {\max(v_t,\varepsilon)}.
          `}
        </Equation>

        <p>
          Here v is a trailing estimate of the standard
          deviation of IV deviations. A positive score
          indicates relatively high implied volatility
          and suggests selling the option. A negative
          score suggests buying it.
        </p>

        <div className="competition-callout">
          <strong>Interpreting the threshold</strong>
          <p>
            The entry threshold measures how unusual
            the current IV deviation is relative to its
            recent variability. A value of 2 represents
            two reference deviation units. Execution
            additionally requires a price advantage
            large enough to cover the trading spread
            and the cost of hedging.
          </p>
        </div>

        <p>
          This temporal reference assumes sufficiently
          stable local moneyness and maturity conditions.
          A large change in the underlying can move the
          contract to a different region of the volatility
          smile. In that situation, the reference needs
          conditioning on moneyness and maturity, or the
          signal must pause.
        </p>

        <h3>Checking executable prices</h3>

        <p>
          Repricing the option at the reference volatility
          converts the IV signal into a price comparison.
        </p>

        <Equation>
          {String.raw`
            C_t^{\mathrm{ref}}
            =C_{\mathrm{BS}}
            (S_t,K,\tau_t,\bar\sigma_t).
          `}
        </Equation>

        <Equation>
          {String.raw`
            \begin{aligned}
              \text{Buy only if}\quad
              &C_t^{\mathrm{ref}}-C_t^{\mathrm{ask}}>k_t,\\
              \text{Sell only if}\quad
              &C_t^{\mathrm{bid}}-C_t^{\mathrm{ref}}>k_t.
            \end{aligned}
          `}
        </Equation>

        <p>
          The buffer k covers estimated additional
          hedging costs and a margin for model uncertainty.
          The option bid-ask spread is already included
          through the executable quote.
        </p>

        <h3>Delta hedging</h3>

        <p>
          Under the stated pricing assumptions, the call
          delta is Phi of d1. Assuming each voucher refers
          to one underlying unit, a portfolio of voucher
          positions n has target underlying inventory
        </p>

        <Equation>
          {String.raw`
            \Delta_{i,t}=\Phi(d_{1,i,t}),
            \qquad
            H_t^\star
            =-\sum_i n_{i,t}\Delta_{i,t}.
          `}
        </Equation>

        <p>
          A long call position is hedged by selling
          underlying units. A short call position is
          hedged by buying them. The order required
          equals the target hedge minus current underlying
          inventory, adjusted for integer quantities and
          position limits.
        </p>

        <p>
          Delta hedging reduces first-order directional
          exposure. The portfolio retains vega, gamma,
          theta and discrete-hedging effects. Locally,
          a delta-hedged option position behaves
          approximately as
        </p>

        <Equation>
          {String.raw`
            d\Pi
            \approx
            \nu\,d\sigma
            +\frac12\Gamma(dS)^2
            +\Theta\,dt
            -d\mathrm{Costs}.
          `}
        </Equation>

        <p>
          Consequently, convergence in implied volatility
          is only one contributor to realised P&amp;L.
          The hedge is updated as prices, option positions
          and deltas change.
        </p>
      </section>

      <section
        className="competition-section"
        id="imc-baskets"
      >
        <p className="competition-section-number">04</p>
        <h2>Basket vs. Synthetic Relative Value</h2>

        <h3>Known composition</h3>

        <p>
          Round 2 introduced two Picnic Baskets and their
          tradable components. Their published
          compositions define the synthetic reference
          directly.
        </p>

        <Equation>
          {String.raw`
            V_{1,t}^{\mathrm{syn}}
            =6P_t^{C}+3P_t^{J}+P_t^{D}.
          `}
        </Equation>

        <Equation>
          {String.raw`
            V_{2,t}^{\mathrm{syn}}
            =4P_t^{C}+2P_t^{J}.
          `}
        </Equation>

        <p>
          C, J and D denote Croissants, Jams and Djembes.
          Each basket also trades in its own order book.
          The difference between its quoted mid-price
          and synthetic value is
        </p>

        <Equation>
          {String.raw`
            D_{j,t}
            =P_{j,t}^{B}-V_{j,t}^{\mathrm{syn}},
            \qquad j\in\{1,2\}.
          `}
        </Equation>

        <p>
          The basket weights come from the product
          definition. A rolling estimate of the observed
          premium accounts for a persistent difference
          between the basket and its synthetic value.
        </p>

        <h3>Signal and threshold</h3>

        <Equation>
          {String.raw`
            z_{j,t}^{B}
            =
            \frac{D_{j,t}-\mu_{D,j,t}}
            {\max(\sigma_{D,j,t},\varepsilon)}.
          `}
        </Equation>

        <p>
          The premium mean and standard deviation use
          earlier observations. A large positive score
          identifies a basket trading unusually high
          relative to its components. A large negative
          score identifies the opposite configuration.
        </p>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Basket one trading decisions"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Basket 1 signal</th>
                <th scope="col">Basket leg</th>
                <th scope="col">Component legs</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Unusually expensive</td>
                <td>Sell 1 basket</td>
                <td>
                  Buy 6 Croissants, 3 Jams and 1 Djembe
                </td>
              </tr>
              <tr>
                <td>Unusually cheap</td>
                <td>Buy 1 basket</td>
                <td>
                  Sell 6 Croissants, 3 Jams and 1 Djembe
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="competition-callout">
          <strong>Interpreting the threshold</strong>
          <p>
            The entry threshold measures the basket
            premium’s deviation from its recent reference,
            in standard deviation units. Entry and exit
            bands operate on the premium, with executable
            prices determining whether a trade has
            sufficient expected value.
          </p>
        </div>

        <h3>Executable synthetic prices</h3>

        <p>
          For Basket 1, the cost of buying the synthetic
          uses component asks. The proceeds from selling
          it use component bids.
        </p>

        <Equation>
          {String.raw`
            A_t^{\mathrm{syn}}
            =6a_t^C+3a_t^J+a_t^D,
            \qquad
            B_t^{\mathrm{syn}}
            =6b_t^C+3b_t^J+b_t^D.
          `}
        </Equation>

        <p>
          Selling the basket and buying its components
          therefore enters the premium at
        </p>

        <Equation>
          {String.raw`
            D_t^{\mathrm{sell}}
            =b_t^{B_1}-A_t^{\mathrm{syn}}.
          `}
        </Equation>

        <p>
          Buying the basket and selling its components
          enters at
        </p>

        <Equation>
          {String.raw`
            D_t^{\mathrm{buy}}
            =a_t^{B_1}-B_t^{\mathrm{syn}}.
          `}
        </Equation>

        <p>
          These executable premiums are compared with
          the expected exit premium, allowing for the
          cost of closing all legs.
        </p>

        <h3>Convergence and execution risk</h3>

        <p>
          Public participant write-ups report that the
          baskets could not be directly converted into
          their components. Closing a position therefore
          requires market trades, and convergence remains
          an economic hypothesis.
        </p>

        <p>
          Available depth and position limits can prevent
          all legs from filling in the intended
          proportions. The algorithm must track actual
          fills and the residual component exposures
          after each update.
        </p>
      </section>

      <section
        className="competition-section"
        id="imc-execution"
      >
        <p className="competition-section-number">05</p>
        <h2>Execution and position limits</h2>

        <h3>Shared inventory across strategies</h3>

        <p>
          All strategies share one position per product.
          Basket trades, statistical spread trades and
          option hedges must therefore be aggregated
          before orders are sized.
        </p>

        <Equation>
          {String.raw`
            \mathbf p_t^\star
            =
            \mathbf p_t^{\mathrm{spread}}
            +\mathbf p_t^{\mathrm{options}}
            +\mathbf p_t^{\mathrm{baskets}}.
          `}
        </Equation>

        <p>
          A desired target must be adjusted to feasible
          positions. This adjustment should preserve
          hedge proportions where possible and explicitly
          account for any residual exposure.
        </p>

        <h3>Documented limits</h3>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Relevant instrument position limits"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Maximum absolute position</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Croissants</td>
                <td>250</td>
              </tr>
              <tr>
                <td>Jams</td>
                <td>350</td>
              </tr>
              <tr>
                <td>Djembes</td>
                <td>60</td>
              </tr>
              <tr>
                <td>Picnic Basket 1</td>
                <td>60</td>
              </tr>
              <tr>
                <td>Picnic Basket 2</td>
                <td>100</td>
              </tr>
              <tr>
                <td>Volcanic Rock</td>
                <td>400</td>
              </tr>
              <tr>
                <td>Each Volcanic Rock Voucher</td>
                <td>200</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          These limits constrain hedge capacity. For
          example, from flat positions, 60 short units
          of Basket 1 would require 360 long Croissants
          for full component replication, exceeding the
          Croissants limit of 250.
        </p>

        <h3>Orders and possible fills</h3>

        <p>
          For a product with current position p and
          absolute limit L, total outstanding buy and
          sell quantities must remain feasible even if
          only one side fills.
        </p>

        <Equation>
          {String.raw`
            p_{i,t}+B_{i,t}\leq L_i,
            \qquad
            p_{i,t}-S_{i,t}\geq-L_i.
          `}
        </Equation>

        <p>
          B and S are non-negative quantities summed
          across submitted orders on each side. Checking
          their net difference alone can underestimate
          exposure when fills are asymmetric.
        </p>

        <p>
          Following each update, actual positions and
          fills determine remaining capacity. Option
          trades reserve underlying capacity for delta
          hedging, while basket trades reserve capacity
          for their component legs.
        </p>
      </section>

      <section
        className="competition-section"
        id="imc-references"
      >
        <p className="competition-section-number">06</p>
        <h2>References</h2>

        <ol className="competition-references">
          <li>
            <strong>IMC Trading.</strong>
            <span>
              Prosperity 3 — IMC’s global trading
              challenge returns. Official announcement,
              competition dates and format.
            </span>
            <a
              href="https://www.imc.com/ap/corporate-news/prosperity-3-IMCs-global-trading-challenge-returns"
              target="_blank"
              rel="noreferrer"
            >
              Read the announcement
            </a>
          </li>

          <li>
            <strong>
              Engle, R. F. &amp; Granger, C. W. J. (1987).
            </strong>
            <span>
              Co-Integration and Error Correction —
              Representation, Estimation, and Testing.
              Econometrica, 55(2), 251–276.
            </span>
            <a
              href="https://doi.org/10.2307/1913236"
              target="_blank"
              rel="noreferrer"
            >
              Read the paper
            </a>
          </li>

          <li>
            <strong>
              Black, F. &amp; Scholes, M. (1973).
            </strong>
            <span>
              The Pricing of Options and Corporate
              Liabilities. Journal of Political Economy,
              81(3), 637–654.
            </span>
            <a
              href="https://doi.org/10.1086/260062"
              target="_blank"
              rel="noreferrer"
            >
              Read the paper
            </a>
          </li>

        </ol>
      </section>
    </main>
  )
}