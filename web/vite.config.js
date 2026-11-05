import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/health": "http://127.0.0.1:8000",
      "/profile": "http://127.0.0.1:8000",
      "/publications": {
        target: "http://127.0.0.1:8000",
        bypass(req) {
          if (req.headers.accept && req.headers.accept.includes("text/html")) {
            return "/index.html"
          }
        },
      },
      "/sections": "http://127.0.0.1:8000",
      "/projects": "http://127.0.0.1:8000",
      "/timeseries": "http://127.0.0.1:8000",
    },
  },
})
