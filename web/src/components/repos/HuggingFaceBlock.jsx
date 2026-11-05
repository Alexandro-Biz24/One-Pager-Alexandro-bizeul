function keepCommand(event) {
  event.preventDefault()
  event.stopPropagation()
}

export function HuggingFaceBlock({ title, text, command, href }) {
  return (
    <a className="repo repo-hf" href={href} target="_blank" rel="noreferrer">
      <svg className="repo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#ffd21e" />
        <circle cx="23" cy="28" r="3.2" fill="#3d2e00" />
        <circle cx="41" cy="28" r="3.2" fill="#3d2e00" />
        <path d="M22 40c3.2 5 16.8 5 20 0" fill="none" stroke="#3d2e00" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="repo-kicker">Hugging Face</p>
      <h2>{title}</h2>
      <p className="repo-text">{text}</p>
      <code onClick={keepCommand}>{command}</code>
    </a>
  )
}
