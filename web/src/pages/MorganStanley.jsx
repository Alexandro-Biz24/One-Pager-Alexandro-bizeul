import { Link } from "react-router-dom"
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
  ["setup", "Market setup"],
  ["order-book", "Order book imbalance"],
  ["momentum", "Short-horizon momentum"],
  ["signals", "Signal combination"],
  ["execution", "Execution and terminal allocation"],
  ["references", "References"],
]

export default function MorganStanley() {
  return (
    <main className="competition-page">
      <Link
        className="competition-back"
        to="/competitions"
      >
        Back to competitions
      </Link>

      <div className="competition-hero">
        <p className="competition-eyebrow">
          September 2025 · Systematic Trading Hackathon
        </p>

        <h1>Morgan Stanley</h1>

        <p className="competition-lead">
          Trading EUR/GBP through a simulated market
          dislocation
        </p>

        <div className="competition-facts">
          <div>
            <span>Result</span>
            <strong>3rd place</strong>
          </div>

          <div>
            <span>Initial capital</span>
            <strong>£1,000,000</strong>
          </div>

          <div>
            <span>Market horizon</span>
            <strong>2 continuous days</strong>
          </div>

          <div>
            <span>Observation interval</span>
            <strong>1 minute</strong>
          </div>
        </div>

        <p className="competition-abstract">
          The challenge was to maximise EUR/GBP trading
          P&amp;L through a simulated market stress event,
          while satisfying currency allocation requirements
          at the end of the session. Two complementary
          signals describe the approach — displayed liquidity
          imbalance and persistence in recent price changes.
        </p>

        <p className="competition-note">
          Methodological reconstruction from the competition
          experience. The decision rules and terminal
          allocation bounds below formalise the approach
          retrospectively.
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
        id="setup"
      >
        <p className="competition-section-number">01</p>
        <h2>Market setup</h2>

        <p>
          Two days of simulated market observations arrived
          sequentially during an accelerated session.
          Timestamps were regular and continuous across the
          two days. Rolling calculations therefore carry
          across the day boundary.
        </p>

        <p>
          EUR/GBP is expressed in GBP per EUR. Let the best
          bid and ask at observation t be b and a. The
          mid-price, quoted spread and one-minute log return
          are defined by
        </p>

        <Equation>
          {String.raw`
            m_t=\frac{a_t+b_t}{2},
            \qquad c_t=a_t-b_t,
            \qquad r_t=\log\left(\frac{m_t}{m_{t-1}}\right).
          `}
        </Equation>

        <p>
          The mid-price provides the reference for signal
          construction and portfolio marking. Trades use
          executable bid and ask prices. The initial
          portfolio contains one million GBP and no EUR.
        </p>

        <Equation>
          {String.raw`
            G_0=1{,}000{,}000\ \mathrm{GBP},
            \qquad E_0=0\ \mathrm{EUR}.
          `}
        </Equation>

        <p>
          All rolling features use only observations
          available at the decision time. A signal can
          trigger an order after the corresponding market
          update has been received.
        </p>
      </section>

      <section
        className="competition-section"
        id="order-book"
      >
        <p className="competition-section-number">02</p>
        <h2>Order Book Imbalance</h2>

        <h3>Economic intuition</h3>

        <p>
          Displayed liquidity describes the quantities
          available to buy or sell at quoted prices. When
          the ask queue is relatively thin, incoming buy
          orders may consume it more quickly. A thin bid
          queue creates the corresponding vulnerability to
          selling pressure.
        </p>

        <p>
          The signal tests whether this asymmetry provides
          information about the direction of the subsequent
          price movement. Displayed quantities are a local
          measure of liquidity and can change as orders
          arrive or are cancelled.
        </p>

        <h3>Signal construction</h3>

        <p>
          Let the displayed quantities at the best bid and
          ask be Q superscript b and Q superscript a,
          expressed in comparable EUR units. For positive
          total displayed quantity, define
        </p>

        <Equation>
          {String.raw`
            I_t=
            \frac{Q_t^b-Q_t^a}{Q_t^b+Q_t^a},
            \qquad I_t\in[-1,1].
          `}
        </Equation>

        <p>
          A positive value indicates more displayed
          quantity at the bid. A negative value indicates
          more quantity at the ask. Values near zero
          indicate approximately balanced queues.
        </p>

        <h3>Decision threshold</h3>

        <Equation>
          {String.raw`
            d_t^{\mathrm{OBI}}=
            \begin{cases}
              +1 & I_t>\tau_I,\\
              0 & |I_t|\leq\tau_I,\\
              -1 & I_t<-\tau_I,
            \end{cases}
            \qquad 0<\tau_I<1.
          `}
        </Equation>

        <p>
          The threshold defines the minimum queue
          asymmetry required to produce a directional
          signal. It creates an inactivity region around
          balanced liquidity.
        </p>

        <div className="competition-callout">
          <strong>Interpreting the threshold</strong>
          <p>
            An illustrative threshold of 0.20 requires more
            than 60% of displayed quantity at the bid for
            a positive signal, or more than 60% at the ask
            for a negative signal. This example explains
            the scale of the indicator.
          </p>
        </div>

        <Equation>
          {String.raw`
            \frac{Q_t^b}{Q_t^b+Q_t^a}
            =\frac{1+I_t}{2}.
          `}
        </Equation>

        <h3>Interpretation under stress</h3>

        <p>
          During a rapid repricing, persistent imbalance
          can support the prevailing direction. A weakening
          imbalance reduces the evidence for continuation.
          Absolute depth and the bid-ask spread remain
          relevant because identical imbalance ratios can
          arise from very different liquidity conditions.
        </p>

        <p>
          The signal here is a snapshot of queue imbalance.
          Estimating order flow imbalance would additionally
          require tracking order book events between
          observations.
        </p>
      </section>

      <section
        className="competition-section"
        id="momentum"
      >
        <p className="competition-section-number">03</p>
        <h2>Short-Horizon Momentum</h2>

        <h3>Economic intuition</h3>

        <p>
          A market dislocation may unfold over several
          observations as participants adjust their
          positions. The momentum component captures the
          hypothesis that recent directional movement can
          persist over a short holding horizon.
        </p>

        <h3>Signal construction</h3>

        <p>
          For a lookback of L minutes, cumulative log
          return is
        </p>

        <Equation>
          {String.raw`
            R_{t,L}
            =\sum_{j=0}^{L-1}r_{t-j}
            =\log\left(\frac{m_t}{m_{t-L}}\right).
          `}
        </Equation>

        <p>
          To express this movement relative to recent
          volatility, use the sample standard deviation of
          the last V one-minute returns
        </p>

        <Equation>
          {String.raw`
            \bar r_{t,V}
            =\frac{1}{V}\sum_{j=0}^{V-1}r_{t-j},
            \qquad
            \hat\sigma_t^2
            =\frac{1}{V-1}
              \sum_{j=0}^{V-1}
              (r_{t-j}-\bar r_{t,V})^2.
          `}
        </Equation>

        <p>
          The scaled momentum score is
        </p>

        <Equation>
          {String.raw`
            M_t=
            \frac{R_{t,L}}
            {\max(\hat\sigma_t\sqrt{L},\,\varepsilon)},
            \qquad \varepsilon>0.
          `}
        </Equation>

        <p>
          The positive floor prevents division by zero.
          Square-root scaling provides a reference under
          approximately uncorrelated returns. The score
          measures movement relative to that reference,
          with its statistical interpretation dependent on
          the return dynamics.
        </p>

        <h3>Decision threshold</h3>

        <Equation>
          {String.raw`
            d_t^{\mathrm{MOM}}=
            \begin{cases}
              +1 & M_t>\tau_M,\\
              0 & |M_t|\leq\tau_M,\\
              -1 & M_t<-\tau_M,
            \end{cases}
            \qquad \tau_M>0.
          `}
        </Equation>

        <div className="competition-callout">
          <strong>Interpreting the threshold</strong>
          <p>
            An illustrative threshold of 1 requires the
            cumulative return to exceed one reference
            volatility unit in magnitude. Increasing the
            threshold requires a stronger movement before
            generating a signal.
          </p>
        </div>

        <p>
          The lookback determines responsiveness. A short
          lookback reacts quickly to a new move, while a
          longer lookback gives more weight to the
          preceding trajectory. Signals remain inactive
          until the required history is available.
        </p>
      </section>

      <section
        className="competition-section"
        id="signals"
      >
        <p className="competition-section-number">04</p>
        <h2>Signal combination</h2>

        <p>
          The proposed combination requires agreement
          between liquidity imbalance and price momentum
          before changing directional exposure. This
          connects a view of the current book with a view
          of the recent price trajectory.
        </p>

        <Equation>
          {String.raw`
            u_t=
            \begin{cases}
              +1
                & d_t^{\mathrm{OBI}}
                  =d_t^{\mathrm{MOM}}=+1,\\
              -1
                & d_t^{\mathrm{OBI}}
                  =d_t^{\mathrm{MOM}}=-1,\\
              0 & \text{otherwise}.
            \end{cases}
          `}
        </Equation>

        <div
          className="competition-table-scroll"
          role="region"
          aria-label="Signal decision table"
          tabIndex={0}
        >
          <table className="competition-table">
            <thead>
              <tr>
                <th scope="col">Order book</th>
                <th scope="col">Momentum</th>
                <th scope="col">Portfolio action</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Positive</td>
                <td>Positive</td>
                <td>Increase EUR exposure</td>
              </tr>
              <tr>
                <td>Negative</td>
                <td>Negative</td>
                <td>Reduce EUR exposure</td>
              </tr>
              <tr>
                <td>Positive</td>
                <td>Negative</td>
                <td>Keep current balances</td>
              </tr>
              <tr>
                <td>Negative</td>
                <td>Positive</td>
                <td>Keep current balances</td>
              </tr>
              <tr>
                <td colSpan={2}>
                  At least one neutral or unavailable signal
                </td>
                <td>Keep current balances</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          A positive action buys EUR against GBP. A negative
          action sells EUR for GBP. Keeping balances
          unchanged preserves the existing currency
          exposure. The signal determines direction, while
          available balances and executable quantities
          determine feasible trade size.
        </p>
      </section>

      <section
        className="competition-section"
        id="execution"
      >
        <p className="competition-section-number">05</p>
        <h2>Execution and terminal allocation</h2>

        <h3>Self-financing currency trades</h3>

        <p>
          Let E and G denote EUR and GBP balances. Portfolio
          NAV, expressed in GBP and marked at the mid-price,
          is
        </p>

        <Equation>
          {String.raw`
            W_t=G_t+m_tE_t.
          `}
        </Equation>

        <p>
          For a signed executed quantity q in EUR,
          positive for a purchase, balances update as
        </p>

        <Equation>
          {String.raw`
            E_t^+=E_t+q_t,
            \qquad
            G_t^+=G_t-q_tp_t^{\mathrm{exec}}.
          `}
        </Equation>

        <p>
          This accounting assumes transaction costs are
          captured by the execution price, with no
          additional fee. A marketable EUR purchase uses
          the ask and a sale uses the bid, provided the
          quoted quantity is sufficient. Larger orders use
          their actual average execution price.
        </p>

        <h3>Terminal currency weights</h3>

        <p>
          Both weights use the same GBP valuation basis
        </p>

        <Equation>
          {String.raw`
            w_t^{\mathrm{EUR}}=\frac{m_tE_t}{W_t},
            \qquad
            w_t^{\mathrm{GBP}}=\frac{G_t}{W_t},
            \qquad
            w_t^{\mathrm{EUR}}
              +w_t^{\mathrm{GBP}}=1.
          `}
        </Equation>

        <p>
          The terminal bounds retained for this
          reconstruction require at least 30% of NAV in
          GBP and at least 60% in EUR. Compliance is
          assessed at the final deadline.
        </p>

        <Equation>
          {String.raw`
            w_T^{\mathrm{GBP}}\geq0.30,
            \qquad
            w_T^{\mathrm{EUR}}\geq0.60.
          `}
        </Equation>

        <Equation>
          {String.raw`
            0.60\leq w_T^{\mathrm{EUR}}\leq0.70,
            \qquad
            0.30\leq w_T^{\mathrm{GBP}}\leq0.40.
          `}
        </Equation>

        <div className="competition-callout">
          <strong>Terminal target</strong>
          <p>
            A 65% EUR / 35% GBP allocation sits inside
            the admissible interval. As the deadline
            approaches, terminal compliance takes priority
            over directional signals.
          </p>
        </div>

        <h3>Accounting for the execution spread</h3>

        <p>
          At a pre-deadline observation, let x = 0.65 be
          the target EUR weight. For an execution price p
          and unchanged marking mid-price m during the
          trade, the post-trade target satisfies
        </p>

        <Equation>
          {String.raw`
            \frac{m_t(E_t+q_t)}
            {W_t+q_t(m_t-p_t^{\mathrm{exec}})}
            =x.
          `}
        </Equation>

        <p>
          Solving for the EUR quantity gives
        </p>

        <Equation>
          {String.raw`
            q_t^\star=
            \frac{xW_t-m_tE_t}
            {m_t-x(m_t-p_t^{\mathrm{exec}})}.
          `}
        </Equation>

        <p>
          A positive quantity is priced at the ask and a
          negative quantity at the bid. The expression
          includes the reduction in marked NAV caused by
          crossing the spread.
        </p>

        <p>
          Following execution, actual balances and updated
          quotes determine the new weights. Rebalancing
          must finish before the deadline, allowing time
          for fills, rounding and subsequent price changes.
        </p>
      </section>

      <section
        className="competition-section"
        id="references"
      >
        <p className="competition-section-number">06</p>
        <h2>References</h2>

        <ol className="competition-references">
          <li>
            <strong>Gould, M. D. &amp; Bonart, J.</strong>
            <span>
              Queue Imbalance as a One-Tick-Ahead Price
              Predictor in a Limit Order Book.
              A reference for queue-based directional
              prediction, studied at a different horizon.
            </span>
            <a
              href="https://arxiv.org/abs/1512.03492"
              target="_blank"
              rel="noreferrer"
            >
              Read the paper
            </a>
          </li>

          <li>
            <strong>
              Cont, R., Kukanov, A. &amp; Stoikov, S.
            </strong>
            <span>
              The Price Impact of Order Book Events.
              A reference for the relationship between
              order flow imbalance, market depth and
              short-term price changes.
            </span>
            <a
              href="https://arxiv.org/abs/1011.6402"
              target="_blank"
              rel="noreferrer"
            >
              Read the paper
            </a>
          </li>

          <li>
            <strong>BIS Markets Committee.</strong>
            <span>
              The sterling flash event of 7 October 2016.
              Market context on order flow, liquidity and
              rapid exchange-rate dislocations.
            </span>
            <a
              href="https://www.bis.org/publ/mktc09.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Read the report
            </a>
          </li>
        </ol>
      </section>

      <div className="competition-footer">
        <Link to="/competitions">
          All competitions
        </Link>
        <a href="#setup">
          Back to market setup
        </a>
      </div>
    </main>
  )
}