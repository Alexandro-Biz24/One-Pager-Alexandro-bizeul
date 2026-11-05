import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getJson } from "../api"
import { publicationSlug } from "../publications"

export function Publications() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    document.title = "Publications — Alexandro Bizeul"
    getJson("/publications")
      .then(setItems)
      .catch(() => setError("The API is not responding."))
  }, [])

  return (
    <main className="pub-list">
      {error && <p className="error">{error}</p>}
      {!error && !items && <p className="meta">Loading.</p>}
      {items?.length === 0 && <p className="meta">Nothing published yet.</p>}
      {items?.length > 0 && (
        <ul>
          {items.map((item) => {
            const slug = publicationSlug(item.project)
            if (!slug) return <li key={item.project}>{item.project}</li>
            return (
              <li key={item.project}>
                <Link to={`/publications/${slug}`}>{item.project}</Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
