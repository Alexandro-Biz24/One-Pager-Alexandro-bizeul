import { useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { GitHubBlock } from "../components/repos/GitHubBlock"
import { HuggingFaceBlock } from "../components/repos/HuggingFaceBlock"
import { PyPiBlock } from "../components/repos/PyPiBlock"
import { publicationPages } from "../publications"

export function Publication() {
  const { slug } = useParams()
  const page = publicationPages[slug]

  useEffect(() => {
    document.title = page ? `${page.title} — Alexandro Bizeul` : "Publications — Alexandro Bizeul"
  }, [page])

  if (!page) {
    return (
      <main className="pub-missing">
        <p>Publication not found.</p>
        <Link to="/publications">Publications</Link>
      </main>
    )
  }

  const { huggingface: hf, pypi, github } = page

  return (
    <main className="pub-page">
      <div className="pub-copy">
        {page.lead.map((parts) => (
          <p key={parts[0]}>
            {parts.map((part) => (typeof part === "string" ? part : <strong key={part.strong}>{part.strong}</strong>))}
          </p>
        ))}
      </div>
      <div className="repo-row">
        <HuggingFaceBlock title={hf.title} text={hf.text} command={hf.command} href={hf.href} />
        <PyPiBlock title={pypi.title} version={pypi.version} text={pypi.text} command={pypi.command} href={pypi.href} />
        <GitHubBlock title={github.title} url={github.url} href={github.href} />
      </div>
    </main>
  )
}
