import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { getJson } from "../api"

export function Header() {
  const { pathname } = useLocation()
  const [name, setName] = useState("Alexandro Bizeul")
  const [sections, setSections] = useState([])
  const current = pathname === "/" ? "curriculum" : pathname.split("/")[1]

  useEffect(() => {
    getJson("/profile")
      .then((p) => setName(p.name || "Alexandro Bizeul"))
      .catch(() => {})
    getJson("/sections")
      .then(setSections)
      .catch(() => {})
  }, [])

  return (
    <header>
      <div className="banner">
        <div className="bar">
          {pathname === "/" ? (
            <h1>{name}</h1>
          ) : (
            <Link to="/" className="banner-name">
              {name}
            </Link>
          )}
        </div>
      </div>
      <nav className="menubar" aria-label="Sections">
        <div className="bar">
          {sections.map((section) => (
            <div className="menu-item" key={section.id}>
              <Link
                to={section.path || `/${section.id}`}
                aria-current={current === section.id ? "page" : undefined}
              >
                {section.label}
              </Link>
              {section.projects?.length > 0 && (
                <div className="dropdown">
                  {section.projects.map((item) => (
                    <Link key={item.slug} to={`/${section.id}/${item.slug}`}>
                      {item.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>
    </header>
  )
}
