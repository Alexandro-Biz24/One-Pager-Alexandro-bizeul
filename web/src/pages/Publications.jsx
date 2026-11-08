import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getJson } from "../api"
import { publicationSlug } from "../publications"

const SPECS_PUBLICATION = {
  slug: "specs-transformer",
  title: "2025 - SPECS-Transformer: Financial Volatility Forecasting",
  year: "2025",
  summary:
    "Independent research into volatility forecasting, probabilistic learning and spectral-aware Transformers.",
}

function publicationEntry(item) {
  const slug = publicationSlug(item.project)

  if (
    slug === "beating-the-national-day-ahead-energy-demand-forecast"
  ) {
    return {
      slug,
      title: "2026 - Multi-Resolution Time-series Transformer Forecasting",
      summary:
        "Reusable PyTorch implementation of a Transformer Neural Network for tokenise time series, available through PyPI, GitHub and Hugging Face.",
    }
  }

  return {
    slug,
    title: item.project,
    summary: "",
  }
}

export function Publications() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    document.title = "Publications — Alexandro Bizeul"

    getJson("/publications")
      .then(setItems)
      .catch(() => setError("The API is not responding."))
  }, [])

  const entries = (items || []).map(publicationEntry)

  if (!entries.some((item) => item.slug === SPECS_PUBLICATION.slug)) {
    entries.push(SPECS_PUBLICATION)
  }

  return (
    <main className="directory-page pub-list">
      <h1>Publications</h1>

      {error && <p className="error">{error}</p>}
      {!error && !items && <p className="meta">Loading.</p>}

      <div className="list">
        {entries.map((item) =>
          item.slug ? (
            <Link
              className="item"
              key={item.slug}
              to={`/publications/${item.slug}`}
            >
              <span className="item-title">
                {item.title}
              </span>

              {item.summary && (
                <span className="item-sum">
                  {item.summary}
                </span>
              )}
            </Link>
          ) : (
            <div className="item" key={item.title}>
              {item.title}
            </div>
          )
        )}
      </div>
    </main>
  )
}