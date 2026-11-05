export function GitHubBlock({ title, url, href }) {
  return (
    <a className="repo repo-gh" href={href} target="_blank" rel="noreferrer">
      <svg className="repo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="16" cy="16" r="5" fill="currentColor" />
        <circle cx="48" cy="32" r="5" fill="currentColor" />
        <circle cx="16" cy="48" r="5" fill="currentColor" />
        <path d="M16 21v22M16 16h14a18 18 0 0 1 18 16" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <p className="repo-kicker">GitHub</p>
      <h2>{title}</h2>
      <p className="repo-url">{url}</p>
    </a>
  )
}
