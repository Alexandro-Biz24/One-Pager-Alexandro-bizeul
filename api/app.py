"""One Render API. Projects live in this service.

Add a project:
1. Copy projects/_template to projects/<slug> (lowercase and hyphens).
2. Edit project.json. Section: competitions, papers, publications, or quant.
3. Optional: keep router.py. Routes are served under /projects/<slug>.
4. Optional: add web/src/projects/<slug>/Page.jsx for its interface.

project.json is read on each request. A new router.py needs a restart.
"""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from timeseries.router import router as timeseries_router

ROOT = Path(__file__).parent
PROJECTS_DIR = ROOT / "projects"
PROFILE_PATH = ROOT / "profile.json"

SECTIONS = [
    {"id": "curriculum", "label": "Curriculum", "path": "/"},
    {"id": "competitions", "label": "Competitions", "path": "/competitions"},
    {"id": "papers", "label": "Papers", "path": "/papers"},
    {"id": "publications", "label": "Publications", "path": "/publications"},
    {"id": "quant", "label": "Quant projects", "path": "/quant"},
]
SECTION_IDS = {s["id"] for s in SECTIONS}

app = FastAPI(title="Alexandro Bizeul")

origins = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def load_profile() -> dict:
    return json.loads(PROFILE_PATH.read_text())


def load_projects() -> list[dict]:
    found = []
    if not PROJECTS_DIR.exists():
        return found
    for folder in PROJECTS_DIR.iterdir():
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        meta_path = folder / "project.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        if meta.get("published") is False:
            continue
        if meta.get("section") not in SECTION_IDS:
            continue
        found.append(
            {
                "slug": folder.name,
                "title": meta.get("title") or folder.name,
                "section": meta["section"],
                "year": meta.get("year") or "",
                "summary": meta.get("summary") or "",
                "tags": meta.get("tags") or [],
                "pdf": meta.get("pdf") or "",
            }
        )
    found.sort(key=lambda p: (str(p["year"]), p["title"]), reverse=True)
    return found


def mount_routers() -> None:
    if not PROJECTS_DIR.exists():
        return
    for folder in PROJECTS_DIR.iterdir():
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        router_file = folder / "router.py"
        meta_file = folder / "project.json"
        if not router_file.exists() or not meta_file.exists():
            continue
        meta = json.loads(meta_file.read_text())
        if meta.get("published") is False or meta.get("section") not in SECTION_IDS:
            continue
        spec = importlib.util.spec_from_file_location(
            f"project_{folder.name}", router_file
        )
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        router = getattr(module, "router", None)
        if router is not None:
            app.include_router(router, prefix=f"/projects/{folder.name}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "alexandro-bizeul", "profile": "/profile", "sections": "/sections"}


@app.get("/profile")
def profile():
    return load_profile()


@app.get("/publications")
def publications():
    path = ROOT / "publications.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


@app.get("/sections")
def sections():
    projects = load_projects()
    out = []
    for section in SECTIONS:
        items = [p for p in projects if p["section"] == section["id"]]
        out.append({**section, "count": len(items), "projects": items})
    return out


@app.get("/projects")
def projects(section: str | None = None):
    items = load_projects()
    if section is None:
        return items
    if section not in SECTION_IDS:
        raise HTTPException(status_code=404, detail="Unknown section")
    return [p for p in items if p["section"] == section]


@app.get("/projects/{slug}")
def project(slug: str):
    for item in load_projects():
        if item["slug"] == slug:
            return item
    raise HTTPException(status_code=404, detail="Project not found")


app.include_router(timeseries_router, prefix="/timeseries")
mount_routers()
