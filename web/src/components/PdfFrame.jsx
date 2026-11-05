import { useEffect, useRef, useState } from "react"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerUrl

const MAX_ZOOM = 4
const DEFAULT_ZOOM = 0.6

function documentMinZoom(frame, pages, aspect) {
  const height = frame?.clientHeight || 0
  const width = frame?.clientWidth || 0
  if (!height || !width || !pages || !aspect) return 0.05
  const fitAll = (height - 12) / (pages * aspect * width)
  return Math.min(1, Math.max(0.005, fitAll))
}

function clampZoom(value, minZoom = 0.05) {
  if (value <= minZoom) return minZoom
  const rounded = Math.round(value * 1000) / 1000
  return Math.min(MAX_ZOOM, Math.max(minZoom, rounded))
}

export function PdfFrame({ src, title, bleed = false }) {
  const shellRef = useRef(null)
  const frameRef = useRef(null)
  const hostRef = useRef(null)
  const thumbsRef = useRef(null)
  const pdfRef = useRef(null)
  const zoomRef = useRef(DEFAULT_ZOOM)
  const aspectRef = useRef(1.414)
  const anchorRef = useRef(null)
  const widthRef = useRef(0)
  const layoutRef = useRef(() => {})
  const [error, setError] = useState("")
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [pageCount, setPageCount] = useState(0)
  const [fitTick, setFitTick] = useState(0)
  const [thumbsOpen, setThumbsOpen] = useState(true)

  const applyLayout = () => {
    const frame = frameRef.current
    const root = hostRef.current
    if (!frame || !root || !frame.clientWidth) return
    const cssWidth = Math.max(1, frame.clientWidth * zoomRef.current)
    for (const slot of root.children) {
      const aspect = Number(slot.dataset.aspect) || aspectRef.current
      slot.style.width = `${cssWidth}px`
      slot.style.height = `${cssWidth * aspect}px`
    }
    const anchor = anchorRef.current
    if (!anchor?.zoom) return
    const ratio = zoomRef.current / anchor.zoom
    const rect = frame.getBoundingClientRect()
    frame.scrollLeft = anchor.contentX * ratio - (anchor.clientX - rect.left)
    frame.scrollTop = anchor.contentY * ratio - (anchor.clientY - rect.top)
    anchorRef.current = null
  }

  layoutRef.current = (next, point) => {
    const frame = frameRef.current
    const minZoom = documentMinZoom(
      frame,
      hostRef.current?.children.length || 1,
      aspectRef.current,
    )
    const clamped = clampZoom(next, minZoom)
    const prev = zoomRef.current
    if (Math.abs(clamped - prev) < 0.001) return
    if (frame && point) {
      const rect = frame.getBoundingClientRect()
      anchorRef.current = {
        clientX: point.x,
        clientY: point.y,
        contentX: point.x - rect.left + frame.scrollLeft,
        contentY: point.y - rect.top + frame.scrollTop,
        zoom: prev,
      }
    } else {
      anchorRef.current = null
    }
    zoomRef.current = clamped
    applyLayout()
    setZoom(clamped)
  }

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const fit = () => {
      const shell = shellRef.current
      if (shell) {
        const top = Math.max(0, shell.getBoundingClientRect().top)
        shell.style.height = `${Math.max(240, window.innerHeight - top)}px`
      }
      const width = frame.clientWidth
      if (width && Math.abs(width - widthRef.current) > 1) {
        widthRef.current = width
        applyLayout()
        setFitTick((n) => n + 1)
      }
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    const header = document.querySelector("header")
    if (header) observer.observe(header)
    window.addEventListener("resize", fit)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [src])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let pinchDist = 0
    let pinchZoom = 1

    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-pixels * 0.002)))
      layoutRef.current(zoomRef.current * factor, { x: event.clientX, y: event.clientY })
    }

    const distance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.hypot(dx, dy)
    }

    const onTouchStart = (event) => {
      if (event.touches.length !== 2) return
      pinchDist = distance(event.touches)
      pinchZoom = zoomRef.current
    }

    const onTouchMove = (event) => {
      if (event.touches.length !== 2 || !pinchDist) return
      event.preventDefault()
      const x = (event.touches[0].clientX + event.touches[1].clientX) / 2
      const y = (event.touches[0].clientY + event.touches[1].clientY) / 2
      layoutRef.current(pinchZoom * distance(event.touches) / pinchDist, { x, y })
    }

    const onTouchEnd = () => {
      pinchDist = 0
    }

    frame.addEventListener("wheel", onWheel, { passive: false })
    frame.addEventListener("touchstart", onTouchStart, { passive: true })
    frame.addEventListener("touchmove", onTouchMove, { passive: false })
    frame.addEventListener("touchend", onTouchEnd)
    return () => {
      frame.removeEventListener("wheel", onWheel)
      frame.removeEventListener("touchstart", onTouchStart)
      frame.removeEventListener("touchmove", onTouchMove)
      frame.removeEventListener("touchend", onTouchEnd)
    }
  }, [src])

  useEffect(() => {
    let cancelled = false
    setError("")
    setPageCount(0)
    zoomRef.current = DEFAULT_ZOOM
    setZoom(DEFAULT_ZOOM)
    hostRef.current?.replaceChildren()

    getDocument({ url: src }).promise
      .then(async (doc) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        pdfRef.current = doc
        const first = await doc.getPage(1)
        if (cancelled) return
        const base = first.getViewport({ scale: 1 })
        aspectRef.current = base.height / base.width
        const root = hostRef.current
        if (!root) return
        root.replaceChildren()
        for (let i = 1; i <= doc.numPages; i += 1) {
          const slot = document.createElement("div")
          slot.className = "pdf-sheet"
          slot.dataset.page = String(i)
          slot.dataset.aspect = String(aspectRef.current)
          slot.style.background = "#fff"
          root.appendChild(slot)
        }
        applyLayout()
        setPageCount(doc.numPages)
      })
      .catch((err) => {
        if (!cancelled) setError("The PDF could not be displayed.")
        console.error(err)
      })

    return () => {
      cancelled = true
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [src])

  useEffect(() => {
    const root = hostRef.current
    const frame = frameRef.current
    const pdf = pdfRef.current
    if (!root || !frame || !pdf || pageCount === 0) return

    let cancelled = false
    let observer = null
    const tasks = []
    const generation = Symbol("pdf-render")
    const timer = setTimeout(() => {
      if (cancelled) return
      const fit = frame.clientWidth || window.innerWidth

      const draw = async (slot) => {
        if (slot.dataset.render === String(generation.description) && slot.dataset.zoom === String(zoomRef.current)) return
        const token = generation
        slot.dataset.zoom = String(zoomRef.current)
        const page = await pdf.getPage(Number(slot.dataset.page))
        if (cancelled || token !== generation) return
        const base = page.getViewport({ scale: 1 })
        const width = Math.max(1, (frame.clientWidth || fit) * zoomRef.current)
        const aspect = base.height / base.width
        slot.dataset.aspect = String(aspect)
        slot.style.width = `${width}px`
        slot.style.height = `${width * aspect}px`
        let scale = width / base.width
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const longest = Math.max(base.width, base.height) * scale * dpr
        if (longest > 4096) scale *= 4096 / longest
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement("canvas")
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        const ctx = canvas.getContext("2d", { alpha: false })
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = "#fff"
        ctx.fillRect(0, 0, viewport.width, viewport.height)
        const task = page.render({ canvasContext: ctx, viewport })
        tasks.push(task)
        try {
          await task.promise
        } catch (err) {
          if (cancelled || err?.name === "RenderingCancelledException") return
          if (!cancelled) setError("The PDF could not be displayed.")
          console.error(err)
          return
        }
        if (cancelled) return
        slot.replaceChildren(canvas)
      }

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            draw(entry.target).catch((err) => {
              if (!cancelled) setError("The PDF could not be displayed.")
              console.error(err)
            })
          }
        },
        { root: frame, rootMargin: "800px 0px" },
      )
      for (const slot of root.children) observer.observe(slot)
    }, 70)

    return () => {
      cancelled = true
      clearTimeout(timer)
      observer?.disconnect()
      for (const task of tasks) task.cancel()
    }
  }, [pageCount, zoom, fitTick, src])

  useEffect(() => {
    const list = thumbsRef.current
    const pdf = pdfRef.current
    const frame = frameRef.current
    if (!list || !pdf || !frame || pageCount === 0) return
    let cancelled = false
    const tasks = []
    list.replaceChildren()

    const goTo = (page) => {
      const slot = hostRef.current?.querySelector(`[data-page="${page}"]`)
      if (!slot) return
      frame.scrollTo({ top: slot.offsetTop, behavior: "smooth" })
    }

    for (let i = 1; i <= pageCount; i += 1) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "pdf-thumb"
      button.dataset.page = String(i)
      const canvas = document.createElement("canvas")
      const label = document.createElement("span")
      label.textContent = String(i)
      button.append(canvas, label)
      button.addEventListener("click", () => goTo(i))
      list.appendChild(button)
    }

    const drawThumb = async (button) => {
      if (button.dataset.drawn === "1") return
      button.dataset.drawn = "1"
      const page = await pdf.getPage(Number(button.dataset.page))
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 248 / base.width })
      const canvas = button.querySelector("canvas")
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      const ctx = canvas.getContext("2d", { alpha: false })
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, viewport.width, viewport.height)
      const task = page.render({ canvasContext: ctx, viewport })
      tasks.push(task)
      try {
        await task.promise
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") console.error(err)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          drawThumb(entry.target).catch((err) => console.error(err))
        }
      },
      { root: list, rootMargin: "500px 0px" },
    )
    for (const button of list.children) observer.observe(button)

    const mark = () => {
      const slots = hostRef.current?.children
      if (!slots?.length) return
      let current = 1
      const line = frame.scrollTop + 28
      for (const slot of slots) {
        if (slot.offsetTop <= line) current = Number(slot.dataset.page)
      }
      for (const button of list.children) {
        button.classList.toggle("is-current", Number(button.dataset.page) === current)
        if (Number(button.dataset.page) === current) button.setAttribute("aria-current", "true")
        else button.removeAttribute("aria-current")
      }
      const active = list.querySelector(".is-current")
      if (!active) return
      const top = active.offsetTop
      const bottom = top + active.offsetHeight
      if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8)
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8
    }

    mark()
    frame.addEventListener("scroll", mark, { passive: true })
    return () => {
      cancelled = true
      observer.disconnect()
      frame.removeEventListener("scroll", mark)
      for (const task of tasks) task.cancel()
    }
  }, [pageCount, src])

  const center = () => {
    const frame = frameRef.current
    if (!frame) return null
    const rect = frame.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height, 320) / 2 }
  }

  const minZoom = documentMinZoom(frameRef.current, pageCount, aspectRef.current)

  return (
    <main className={bleed ? "pdf-shell bleed" : "pdf-shell"} aria-label={title} ref={shellRef}>
      <aside className={thumbsOpen ? "pdf-thumbs" : "pdf-thumbs is-hidden"} aria-label="Pages">
        <button
          type="button"
          className="pdf-thumbs-toggle"
          aria-expanded={thumbsOpen}
          aria-label={thumbsOpen ? "Hide thumbnails" : "Show thumbnails"}
          onClick={() => setThumbsOpen((open) => !open)}
        >
          {thumbsOpen ? "‹" : "›"}
        </button>
        <div className="pdf-thumbs-list" ref={thumbsRef} />
      </aside>
      <div className="cv-frame" ref={frameRef}>
      <div className="pdf-pages" ref={hostRef} />
      {pageCount > 0 && (
        <div className="pdf-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= minZoom + 0.0005}
            onClick={() => layoutRef.current(zoomRef.current / 1.25, center())}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Fit to width"
            onClick={() => layoutRef.current(1, center())}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => layoutRef.current(zoomRef.current * 1.25, center())}
          >
            +
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      </div>
    </main>
  )
}
