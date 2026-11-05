import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJson } from "../api"

export function Section() {
  const { sectionId } = useParams()
  const [section, setSection] = useState(undefined)
  const [error, setError] = useState("")

  useEffect(() => {
    setSection(undefined)
    setError("")
    getJson("/sections")
      .then((list) => {
        const found = list.find((s) => s.id === sectionId)
        setSection(found || null)
        if (found) document.title = `${found.label} — Alexandro Bizeul`
      })
      .catch(() => setError("The API is not responding."))
  }, [sectionId])

  if (error) return <p className="error">{error}</p>
  if (section === undefined) return <p className="meta">Loading.</p>
  if (section === null) return <p className="meta">Section not found.</p>

  return (
    <main>
      <h1>{section.label}</h1>
      {section.projects.length === 0 ? (
        <p className="meta">Nothing published yet.</p>
      ) : (
        <div className="list">
          {section.projects.map((project) => (
            <Link
              className="item"
              key={project.slug}
              to={`/${section.id}/${project.slug}`}
            >
              <span className="item-title">
                {project.title}
                {project.year && <span className="count"> {project.year}</span>}
              </span>
              {project.summary && <span className="item-sum">{project.summary}</span>}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
