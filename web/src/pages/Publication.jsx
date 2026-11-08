import {
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import { useParams } from "react-router-dom"
import { GitHubBlock } from "../components/repos/GitHubBlock"
import { HuggingFaceBlock } from "../components/repos/HuggingFaceBlock"
import { PyPiBlock } from "../components/repos/PyPiBlock"
import { publicationPages } from "../publications"
import SpecsPublication from "./SpecsPublication"
import "./PageLayoutAdjustments.css"

function PublicationDashboard({ page }) {
  const stageRef = useRef(null)
  const contentRef = useRef(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    const content = contentRef.current

    if (!stage || !content) return

    let frameId = null
    let disposed = false

    function fitContent() {
      if (disposed) return

      const availableWidth = Math.max(
        1,
        stage.clientWidth - 32
      )

      const availableHeight = Math.max(
        1,
        stage.clientHeight - 32
      )

      const contentWidth = Math.min(
        1100,
        availableWidth
      )

      content.style.width = `${contentWidth}px`

      const naturalHeight = Math.max(
        1,
        content.offsetHeight
      )

      const scale = Math.min(
        1,
        availableHeight / naturalHeight
      )

      content.style.setProperty(
        "--publication-scale",
        String(scale)
      )
    }

    function scheduleFit() {
      if (disposed) return

      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(fitContent)
    }

    fitContent()

    const observer = new ResizeObserver(scheduleFit)

    observer.observe(stage)
    observer.observe(content)

    window.addEventListener("resize", scheduleFit)

    document.fonts?.ready.then(scheduleFit)

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener("resize", scheduleFit)
    }
  }, [page])

  const { huggingface: hf, pypi, github } = page

  return (
    <main
      className="publication-dashboard"
      ref={stageRef}
      aria-labelledby="publication-title"
    >
      <div
        className="publication-dashboard-content"
        ref={contentRef}
      >
        <div className="publication-dashboard-heading">
          <h1 id="publication-title">
            {page.title}
          </h1>
        </div>

        <div className="publication-dashboard-copy">
          {page.lead.map((parts, paragraphIndex) => (
            <p key={paragraphIndex}>
              {parts.map((part, partIndex) => {
                if (typeof part === "string") {
                  return part
                }

                if (part.href) {
                  return (
                    <a
                      key={partIndex}
                      className="publication-paper-link"
                      href={part.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <strong>{part.strong}</strong>
                    </a>
                  )
                }

                return (
                  <strong key={partIndex}>
                    {part.strong}
                  </strong>
                )
              })}
            </p>
          ))}
        </div>

        <div className="repo-row">
          <HuggingFaceBlock
            title={hf.title}
            text={hf.text}
            command={hf.command}
            href={hf.href}
          />

          <PyPiBlock
            title={pypi.title}
            version={pypi.version}
            text={pypi.text}
            command={pypi.command}
            href={pypi.href}
          />

          <GitHubBlock
            title={github.title}
            url={github.url}
            href={github.href}
          />
        </div>
      </div>
    </main>
  )
}

export function Publication() {
  const { slug } = useParams()
  const page = publicationPages[slug]

  useEffect(() => {
    if (slug === "specs-transformer") return

    document.title = page
      ? `${page.title} — Alexandro Bizeul`
      : "Publications — Alexandro Bizeul"
  }, [page, slug])

  if (slug === "specs-transformer") {
    return <SpecsPublication />
  }

  if (!page) {
    return (
      <main className="pub-missing">
        <p>Publication not found.</p>
      </main>
    )
  }

  return <PublicationDashboard page={page} />
}