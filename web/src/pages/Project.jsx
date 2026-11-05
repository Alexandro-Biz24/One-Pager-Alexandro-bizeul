import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { getJson } from "../api"
import { PdfFrame } from "../components/PdfFrame"
import { loadProjectPage } from "../projects/registry"

export function Project() {
  const { sectionId, slug } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [error, setError] = useState("")
  const load = useMemo(() => loadProjectPage(slug), [slug])
  const Page = useMemo(() => (load ? lazy(load) : null), [load])

  useEffect(() => {
    setProject(null)
    setError("")
    getJson(`/projects/${slug}`)
      .then((item) => {
        setProject(item)
        document.title = `${item.title} — Alexandro Bizeul`
      })
      .catch((err) => {
        setError(err.status === 404 ? "Project not found." : "The API is not responding.")
      })
  }, [slug])

  useEffect(() => {
    if (project && project.section !== sectionId) {
      navigate(`/${project.section}/${project.slug}`, { replace: true })
    }
  }, [project, sectionId, navigate])

  if (error) return <p className="error">{error}</p>
  if (!project) return <p className="meta">Loading.</p>

  if (project.pdf) {
    return <PdfFrame title={project.title} src={project.pdf} bleed />
  }

  if (Page) {
    return (
      <main>
        <Suspense fallback={<p className="meta">Loading.</p>}>
          <Page project={project} />
        </Suspense>
      </main>
    )
  }

  return (
    <main>
      <h1>{project.title}</h1>
      {project.year && <p className="meta">{project.year}</p>}
      {project.summary && <p className="summary">{project.summary}</p>}
      {project.tags?.length > 0 && (
        <p className="meta">{project.tags.join(" · ")}</p>
      )}
    </main>
  )
}
