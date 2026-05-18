"""Utility helpers for the math animator pipeline."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Any


def extract_json_object(text: str) -> dict[str, Any]:
    """Extract a JSON object from raw model output."""
    raw = (text or "").strip()
    if not raw:
        return {}

    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    candidates = fenced + [raw]

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            parsed = _decode_first_json_object(candidate)
            if parsed is not None:
                return parsed

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        snippet = raw[start : end + 1]
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            parsed = _decode_first_json_object(snippet)
            if parsed is not None:
                return parsed

    raise json.JSONDecodeError("No JSON object found", raw, 0)


def _decode_first_json_object(text: str) -> dict[str, Any] | None:
    decoder = json.JSONDecoder()
    stripped = (text or "").lstrip()
    if not stripped:
        return None

    starts = [0]
    brace_index = stripped.find("{")
    if brace_index > 0:
        starts.append(brace_index)

    for start in starts:
        try:
            parsed, _end = decoder.raw_decode(stripped[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def slugify_filename(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip()).strip("-")
    return cleaned or fallback


def trim_error_message(stderr: str, limit: int = 1200) -> str:
    text = (stderr or "").strip()
    if len(text) <= limit:
        return text
    return text[-limit:]


def build_repair_error_message(error_message: str) -> str:
    text = (error_message or "").strip()
    lowered = text.lower()
    hints: list[str] = []

    if "append_points" in lowered and "shape (1,2)" in lowered and "shape (1,3)" in lowered:
        hints.append(
            "Detected a 2D-to-3D point mismatch in Manim. Every point array passed into "
            "Line/Polygon/VMobject/set_points_as_corners/append_points must be 3D."
        )
        hints.append(
            "Replace points like [x, y] or np.array([x, y]) with [x, y, 0] or np.array([x, y, 0])."
        )
        hints.append(
            "If coordinates come from axes or planes, prefer axes.c2p(...) / plane.c2p(...) so Manim receives 3D points."
        )
        hints.append(
            "Check any custom point lists, helper lines, braces, polygons, or manually assembled VMobject paths."
        )

    if "get_start" in lowered or "get_end" in lowered or "size 0" in lowered or "index 0 is out of bounds" in lowered or "empty" in lowered:
        hints.append(
            "Detected an issue where `.get_start()`, `.get_end()`, or point-indexing was called on a Mobject with no points "
            "(e.g., an empty VMobject, a VGroup, or an uninitialized shape)."
        )
        hints.append(
            "Ensure all Mobjects have points initialized before trying to access their coordinates. "
            "For example, lines, curves, axes, or custom shapes must be fully constructed with proper coordinates."
        )
        hints.append(
            "If you are aligning objects or getting positions on a coordinate system, "
            "prefer using `axes.c2p(...)` (coordinates-to-point) or direct positioning methods like `.next_to(...)` or `.to_edge(...)` "
            "instead of extracting coordinate endpoints from unpopulated/point-less parent Mobjects."
        )

    if "latex error" in lowered or "compile_tex" in lowered or "dvi" in lowered:
        hints.append(
            "LaTeX compilation failed. It appears LaTeX (latex/dvips) is NOT installed or broken on this system."
        )
        hints.append(
            "CRITICAL: You MUST NOT use `MathTex` or `Tex`. Replace them with `Text()` for all mathematical notation and labels."
        )
        hints.append(
            "Example: Change `MathTex('y = 2x + 1')` to `Text('y = 2x + 1')`."
        )

    if "color" in lowered and "not found" in lowered:
        hints.append(
            "A color was not found. This often happens if you pass multiple positional arguments to `Text()`. "
            "Ensure `Text()` receives exactly one string as its first positional argument. "
            "Example: Use `Text('y = 2x + 1')` instead of `Text('y', '=', '2x + 1')`."
        )

    if "name" in lowered and "is not defined" in lowered:
        # Check for patterns like calculation_steps0
        if re.search(r"[a-z_]+[0-9]+", lowered):
            hints.append(
                "Detected a possible NameError due to missing brackets. "
                "Ensure you use square brackets for indexing. Example: `list[0]` instead of `list0`."
            )

    if not hints:
        return text

    return text + "\n\nTargeted repair hints:\n- " + "\n- ".join(hints)


def get_latex_path() -> str | None:
    """Find the path to the latex executable, checking common locations on macOS."""
    found = shutil.which("latex")
    if found:
        return found

    # Common macOS path for BasicTeX/MacTeX
    macos_texbin = "/Library/TeX/texbin/latex"
    if os.path.exists(macos_texbin):
        return macos_texbin

    return None


def has_latex() -> bool:
    """Check if LaTeX is available on the system and has the required standalone package."""
    latex_path = get_latex_path()
    if not latex_path:
        return False

    # Check for standalone.cls as Manim requires it
    tex_dir = os.path.dirname(latex_path)
    kpsewhich = os.path.join(tex_dir, "kpsewhich")
    if os.path.exists(kpsewhich):
        try:
            result = subprocess.run(
                [kpsewhich, "standalone.cls"], capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                return True
        except Exception:
            pass

    return False


__all__ = [
    "build_repair_error_message",
    "extract_json_object",
    "get_latex_path",
    "has_latex",
    "slugify_filename",
    "trim_error_message",
]
