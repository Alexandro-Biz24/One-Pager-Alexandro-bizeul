const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "")

export async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

export async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}
