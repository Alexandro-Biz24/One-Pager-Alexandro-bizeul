import { PdfFrame } from "../../components/PdfFrame"

export default function Page({ project }) {
  return (
    <PdfFrame
      title={project?.title || "Multi-resolution Time-Series Transformer"}
      src={project?.pdf || "/papers/multiresolution-time-series-transformer.pdf"}
      bleed
    />
  )
}
