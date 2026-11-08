import { useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import MorganStanley from "./MorganStanley"
import ImcProsperity from "./ImcProsperity"
import EdmondDeRothschild from "./EdmondDeRothschild"
import "./Competitions.css"

export const COMPETITIONS = [
  {
    slug: "morgan-stanley",
    menuTitle: "Morgan Stanley — Systematic Trading",
    title: "Morgan Stanley",
    subtitle: "Systematic Trading Hackathon",
    date: "September 2025",
    result: "3rd place",
    summary:
      "EUR/GBP trading under market stress, combining order book imbalance and short-horizon momentum.",
  },
  {
    slug: "imc-prosperity",
    menuTitle: "IMC — Prosperity 3",
    title: "IMC",
    subtitle: "Prosperity 3",
    date: "April 2025",
    result: "Top 1%",
    summary:
      "Spread mean reversion, delta-hedged implied volatility trading and basket vs. synthetic relative value.",
  },
  {
    slug: "edmond-de-rothschild",
    menuTitle:
      "Edmond de Rothschild — Quantitative Research",
    title: "Edmond de Rothschild",
    subtitle: "Quantitative Research Hackathon",
    date: "February–April 2024",
    result: "1st place",
    summary:
      "Interpretable event scoring to investigate fund flows, AUM dynamics and factor-based defensive allocation.",
  },
]

export function Competitions() {
  useEffect(() => {
    document.title =
      "Competitions — Alexandro Bizeul"
  }, [])

  return (
    <main className="directory-page competition-directory">
      <h1>Competitions</h1>

      <div className="list">
        {COMPETITIONS.map((entry) => (
          <Link
            className="item"
            key={entry.slug}
            to={`/competitions/${entry.slug}`}
          >
            <span className="competition-entry-meta">
              {entry.date} · {entry.result}
            </span>

            <span className="item-title">
              {entry.title}

              <span className="competition-entry-subtitle">
                {entry.subtitle}
              </span>
            </span>

            <span className="item-sum">
              {entry.summary}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}

export function Competition() {
  const { slug } = useParams()

  const entry = COMPETITIONS.find(
    (item) => item.slug === slug
  )

  useEffect(() => {
    document.title = entry
      ? `${entry.title} — Alexandro Bizeul`
      : "Competition not found — Alexandro Bizeul"
  }, [entry])

  if (entry?.slug === "morgan-stanley") {
    return <MorganStanley />
  }

  if (entry?.slug === "imc-prosperity") {
    return <ImcProsperity />
  }

  if (entry?.slug === "edmond-de-rothschild") {
    return <EdmondDeRothschild />
  }

  return (
    <main className="competition-page">
      <div className="competition-hero">
        <p className="competition-eyebrow">
          Competitions
        </p>

        <h1>Competition not found</h1>

        <p className="competition-lead">
          This competition page could not be found.
        </p>
      </div>
    </main>
  )
}