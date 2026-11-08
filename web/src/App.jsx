import { useLayoutEffect } from "react"
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom"
import { Header } from "./components/Header"
import { Home } from "./pages/Home"
import { Section } from "./pages/Section"
import { Project } from "./pages/Project"
import { Publications } from "./pages/Publications"
import { Publication } from "./pages/Publication"
import {
  Competitions,
  Competition,
} from "./pages/Competitions"

function ResearchRedirect() {
  const { slug } = useParams()

  return (
    <Navigate
      to={slug ? `/papers/${slug}` : "/papers"}
      replace
    />
  )
}

function CompetitionRedirect() {
  const { slug } = useParams()

  return (
    <Navigate
      to={slug ? `/competitions/${slug}` : "/competitions"}
      replace
    />
  )
}

export function App() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    })
  }, [pathname])

  return (
    <div className="app">
      <Header />

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/curriculum"
          element={<Navigate to="/" replace />}
        />

        <Route
          path="/parcours"
          element={<Navigate to="/" replace />}
        />

        <Route
          path="/publications"
          element={<Publications />}
        />

        <Route
          path="/publications/:slug"
          element={<Publication />}
        />

        <Route
          path="/recherche"
          element={<Navigate to="/papers" replace />}
        />

        <Route
          path="/research"
          element={<Navigate to="/papers" replace />}
        />

        <Route
          path="/research/:slug"
          element={<ResearchRedirect />}
        />

        <Route
          path="/competitions"
          element={<Competitions />}
        />

        <Route
          path="/competitions/:slug"
          element={<Competition />}
        />

        <Route
          path="/competition"
          element={<CompetitionRedirect />}
        />

        <Route
          path="/competition/:slug"
          element={<CompetitionRedirect />}
        />

        <Route
          path="/hackathons"
          element={<CompetitionRedirect />}
        />

        <Route
          path="/hackathons/:slug"
          element={<CompetitionRedirect />}
        />

        <Route
          element={
            <div className="wrap">
              <Outlet />
            </div>
          }
        >
          <Route
            path="/:sectionId"
            element={<Section />}
          />

          <Route
            path="/:sectionId/:slug"
            element={<Project />}
          />
        </Route>
      </Routes>
    </div>
  )
}