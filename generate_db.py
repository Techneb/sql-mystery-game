"""Builds the Ritz Affair database, chapters.json, schema.svg and solution.sql. Stdlib only."""
import re

from plot import STOP_WORDS


def normalise(s):
    """Same rules as normalise() in site/app.js. Keep both in sync (fixture in chapters.json)."""
    tokens = [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOP_WORDS]
    if tokens and all(t.isdigit() for t in tokens):
        return "".join(tokens)
    return " ".join(tokens)
