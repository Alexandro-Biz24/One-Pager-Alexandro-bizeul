import { useEffect } from "react"
import { PdfFrame } from "../components/PdfFrame"

export function Home() {
  useEffect(() => {
    document.title = "Alexandro Bizeul"
  }, [])

  return <PdfFrame title="Curriculum vitae" src="/cv.pdf" />
}
