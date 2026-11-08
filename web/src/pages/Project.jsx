
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useNavigate, useParams } from "react-router-dom"
import { getJson } from "../api"
import { PdfFrame } from "../components/PdfFrame"
import { loadProjectPage } from "../projects/registry"

const SPECS_SLUG = "specs-transformer"

const SPECS_PDF = "/papers/specs-transformer.pdf"

const SPECS_TITLE =
  "SPECS-Transformer: A Transformer Architecture for Volatility Forecasting with Signal-Spectrum Dynamics"

export function Project() {
  const { sectionId, slug } = useParams()
  const navigate = useNavigate()

  const isSpecsPaper =
    sectionId === "papers" && slug === SPECS_SLUG

  const [project, setProject] = useState(null)
  const [error, setError] = useState("")

  const load = useMemo(
    () => loadProjectPage(slug),
    [slug]
  )

  const Page = useMemo(
    () => (load ? lazy(load) : null),
    [load]
  )

  useEffect(() => {
    setProject(null)
    setError("")

    if (isSpecsPaper) {
      document.title = `${SPECS_TITLE} — Alexandro Bizeul`
      return
    }

    let active = true

    getJson(`/projects/${slug}`)
      .then((item) => {
        if (!active) return

        setProject(item)
        document.title = `${item.title} — Alexandro Bizeul`
      })
      .catch((err) => {
        if (!active) return

        setError(
          err.status === 404
            ? "Project not found."
            : "The API is not responding."
        )
      })

    return () => {
      active = false
    }
  }, [slug, isSpecsPaper])

  useEffect(() => {
    if (
      !isSpecsPaper &&
      project &&
      project.section !== sectionId
    ) {
      navigate(
        `/${project.section}/${project.slug}`,
        { replace: true }
      )
    }
  }, [project, sectionId, navigate, isSpecsPaper])

  // Dedicated research paper: no backend project required.
  if (isSpecsPaper) {
    return (
      <PdfFrame
        title={SPECS_TITLE}
        src={SPECS_PDF}
        bleed
      />
    )
  }

  if (error) {
    return <p className="error">{error}</p>
  }

  if (!project) {
    return <p className="meta">Loading.</p>
  }

  if (project.pdf) {
    return (
      <PdfFrame
        title={project.title}
        src={project.pdf}
        bleed
      />
    )
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

      {project.year && (
        <p className="meta">{project.year}</p>
      )}

      {project.summary && (
        <p className="summary">{project.summary}</p>
      )}

      {project.tags?.length > 0 && (
        <p className="meta">
          {project.tags.join(" · ")}
        </p>
      )}
    </main>
  )
}
