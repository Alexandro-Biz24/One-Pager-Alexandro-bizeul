import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom"
import { Header } from "./components/Header"
import { Home } from "./pages/Home"
import { Section } from "./pages/Section"
import { Project } from "./pages/Project"
import { Publications } from "./pages/Publications"
import { Publication } from "./pages/Publication"

function ResearchRedirect() {
  const { slug } = useParams()
  return <Navigate to={slug ? `/papers/${slug}` : "/papers"} replace />
}

export function App() {
  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/curriculum" element={<Navigate to="/" replace />} />
        <Route path="/parcours" element={<Navigate to="/" replace />} />
        <Route path="/publications" element={<Publications />} />
        <Route path="/publications/:slug" element={<Publication />} />
        <Route path="/recherche" element={<Navigate to="/papers" replace />} />
        <Route path="/research" element={<Navigate to="/papers" replace />} />
        <Route path="/research/:slug" element={<ResearchRedirect />} />
        <Route
          element={
            <div className="wrap">
              <Outlet />
            </div>
          }
        >
          <Route path="/:sectionId" element={<Section />} />
          <Route path="/:sectionId/:slug" element={<Project />} />
        </Route>
      </Routes>
    </div>
  )
}
