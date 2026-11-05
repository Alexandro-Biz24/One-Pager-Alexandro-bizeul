// Interface d'un projet : src/projects/<slug>/Page.jsx
// Le slug est le nom du dossier api/projects/<slug>.
const loaders = import.meta.glob("./*/Page.jsx")

export function loadProjectPage(slug) {
  const load = loaders[`./${slug}/Page.jsx`]
  return load || null
}
