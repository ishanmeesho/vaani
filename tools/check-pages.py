#!/usr/bin/env python3
"""Pre-publish check for the Vaani dashboards site.

Every page except the landing page must give the reader a way back to the
Vaani Dashboards index. A page without it is a dead end — the reader has to
use the browser's back button or edit the URL, and on a freshly-opened link
there is no back button to use.

Run before pushing:   python3 tools/check-pages.py
Exits non-zero and names every offending file if anything is wrong.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANDING = "index.html"


def pages():
    os.chdir(ROOT)
    found = sorted(set(glob.glob("*.html") + glob.glob("*/*.html")))
    return [f for f in found if f != LANDING]


def check(path):
    """Return a list of problems for one page."""
    problems = []
    src = open(path, encoding="utf-8").read()
    depth = path.count("/")
    prefix = "../" * depth

    # 1. A link back to the landing page, at the right relative depth.
    back = re.search(r'href="(\.\./)*index\.html"', src)
    if not back:
        problems.append("no link back to the landing page")
    elif depth and f'href="{prefix}index.html"' not in src:
        problems.append(
            f'back link is not at the right depth (expected href="{prefix}index.html")'
        )

    # 2. A real document shell. A fragment renders, but has no <head>, so it
    #    gets no title in the tab, no favicon and no viewport meta on mobile.
    low = src.lower()
    for tag in ("<!doctype", "<html", "<head", "<body"):
        if tag not in low:
            problems.append(f"missing {tag.strip('<')} — page is a bare fragment")

    # 3. Mobile viewport, or the page renders desktop-width on a phone.
    if "name=\"viewport\"" not in src and "name='viewport'" not in src:
        problems.append("no viewport meta")

    # 4. A title, or the browser tab shows the file name.
    if "<title>" not in low:
        problems.append("no <title>")

    return problems


def main():
    failures = {}
    checked = pages()
    for path in checked:
        found = check(path)
        if found:
            failures[path] = found

    if not failures:
        print(f"OK — {len(checked)} pages checked, all have a back link and a full shell.")
        return 0

    print(f"FAILED — {len(failures)} of {len(checked)} pages have problems:\n")
    for path, found in failures.items():
        print(f"  {path}")
        for problem in found:
            print(f"      - {problem}")
    print(
        "\nEvery page needs a back link to the landing page. Copy the banner from any\n"
        "existing dashboard, or see the 'Adding a new dashboard' section of README.md."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
