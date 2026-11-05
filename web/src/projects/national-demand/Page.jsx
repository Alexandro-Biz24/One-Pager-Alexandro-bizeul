import { useState } from "react"

const MODELS = [
  { id: "statistical", label: "Statistical" },
  { id: "ml", label: "Machine learning" },
  { id: "dl", label: "Deep learning" },
]

export default function Page() {
  const [model, setModel] = useState(MODELS[0].id)
  const current = MODELS.find((item) => item.id === model) || MODELS[0]

  return (
    <div className="model-screen">
      <div className="model-switch" role="group" aria-label="Model">
        {MODELS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === model}
            onClick={() => setModel(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="model-cols">
        <section>
          <h2>Feature engineering</h2>
          <p className="meta">Common to the three models. It will be filled from the notebook.</p>
        </section>
        <section>
          <h2>{current.label}</h2>
          <p className="meta">Mathematical definition, in LaTeX, from the notebook.</p>
        </section>
        <section>
          <h2>Statistical tests</h2>
          <p className="meta">Graphs and tables from the notebook. Nothing is plotted yet.</p>
        </section>
      </div>
    </div>
  )
}
