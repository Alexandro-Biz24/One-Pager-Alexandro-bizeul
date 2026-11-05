function keepCommand(event) {
  event.preventDefault()
  event.stopPropagation()
}

export function PyPiBlock({ title, version, text, command, href }) {
  return (
    <a className="repo repo-pypi" href={href} target="_blank" rel="noreferrer">
      <svg className="repo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M8 24 32 12l24 12-24 12Z" fill="#ffd343" />
        <path d="M8 24v20l24 12V36Z" fill="#0b4f8a" />
        <path d="M56 24v20L32 56V36Z" fill="#08386a" />
      </svg>
      <p className="repo-kicker">PyPI</p>
      <h2>
        {title}
        {version && <span>v{version}</span>}
      </h2>
      <p className="repo-text">{text}</p>
      <code onClick={keepCommand}>{command}</code>
    </a>
  )
}
