import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { getJson } from "../api"
import { siteIdentity } from "../siteIdentity"
import { COMPETITIONS } from "../pages/Competitions"

function IdentityItem({ entry }) {
  const [broken, setBroken] = useState(false)

  return (
    <div className="identity-item">
      {!broken && entry.logo ? (
        <img
          className="identity-logo"
          src={entry.logo}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="identity-logo identity-logo-placeholder"
          aria-hidden="true"
        >
          {entry.initials}
        </span>
      )}

      <span className="identity-details">
        {entry.role && (
          <span className="identity-role">
            {entry.role} at :
          </span>
        )}
        <span className="identity-name">
          {entry.name}
        </span>
      </span>
    </div>
  )
}

const EXTRA_MENU_ITEMS = {
  papers: [
    {
      slug: "specs-transformer",
      title: "SPECS-Transformer — Volatility Forecasting",
    },
  ],
  publications: [
    {
      slug: "beating-the-national-day-ahead-energy-demand-forecast",
      title: "Python Package — MTST Forecasting",
    },
    {
      slug: "specs-transformer",
      title: "Research Paper — SPECS-Transformer",
    },
  ],
}

const COMPETITION_SECTION = {
  id: "competitions",
  label: "Competitions",
  path: "/competitions",
  projects: COMPETITIONS.map(({ slug, menuTitle }) => ({
    slug,
    title: menuTitle,
  })),
}

function isCompetitionSection(section) {
  return /compet|hackathon/i.test(
    `${section.id || ""} ${section.label || ""} ${section.path || ""}`
  )
}

export function Header() {
  const { pathname } = useLocation()
  const [name, setName] = useState("Alexandro Bizeul")
  const [sections, setSections] = useState([])

  const current =
    pathname === "/"
      ? "curriculum"
      : pathname.split("/")[1]

  useEffect(() => {
    let active = true

    getJson("/profile")
      .then((profile) => {
        if (active) {
          setName(profile.name || "Alexandro Bizeul")
        }
      })
      .catch(() => {})

    getJson("/sections")
      .then((items) => {
        if (active && Array.isArray(items)) {
          setSections(items)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const navigation = []
  let competitionAdded = false

  for (const section of sections) {
    if (isCompetitionSection(section)) {
      if (!competitionAdded) {
        navigation.push(COMPETITION_SECTION)
        competitionAdded = true
      }
    } else {
      navigation.push(section)
    }
  }

  if (!competitionAdded) {
    navigation.push(COMPETITION_SECTION)
  }

  return (
    <header>
      <div className="banner">
        <div className="bar banner-bar">
          {pathname === "/" ? (
            <h1>{name}</h1>
          ) : (
            <Link to="/" className="banner-name">
              {name}
            </Link>
          )}

          <div
            className="identity-group"
            aria-label="Professional affiliations"
          >
            <IdentityItem
              entry={siteIdentity.currentPosition}
            />
            <IdentityItem
              entry={siteIdentity.university}
            />
          </div>
        </div>
      </div>

      <nav className="menubar" aria-label="Sections">
        <div className="bar">
          {navigation.map((section) => {
            const original = section.projects || []
            const extra = EXTRA_MENU_ITEMS[section.id] || []

            const projects = [
              ...original,
              ...extra.filter(
                (item) =>
                  !original.some(
                    (existing) =>
                      existing.slug === item.slug
                  )
              ),
            ]

            return (
              <div
                className="menu-item"
                key={section.id}
              >
                <Link
                  to={section.path || `/${section.id}`}
                  aria-current={
                    current === section.id
                      ? "page"
                      : undefined
                  }
                >
                  {section.label}
                </Link>

                {projects.length > 0 && (
                  <div className="dropdown">
                    {projects.map((item) => (
                      <Link
                        key={item.slug}
                        to={`/${section.id}/${item.slug}`}
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>
    </header>
  )
}