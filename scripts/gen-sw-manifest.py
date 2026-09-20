#!/usr/bin/env python3
"""Generate sw-assets.json: everything the app needs to run offline.

The version is a hash of the file contents, so changing any file busts the
service-worker cache. scripts/validate.py checks this file matches what is
actually on disk, the same way it checks the story index.
"""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
INCLUDE_DIRS = ['css', 'js', 'data', 'audio', 'assets/icons']
INCLUDE_FILES = ['index.html', 'manifest.json']
SKIP_SUFFIX = {'.md', '.py', '.sh'}


def assets():
    out = list(INCLUDE_FILES)
    for d in INCLUDE_DIRS:
        for f in sorted((ROOT / d).rglob('*')):
            if f.is_file() and f.suffix not in SKIP_SUFFIX and not f.name.startswith('.'):
                out.append(str(f.relative_to(ROOT)))
    return sorted(out)


def version(paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(p.encode())
        h.update((ROOT / p).read_bytes())
    return h.hexdigest()[:12]


if __name__ == '__main__':
    a = assets()
    out = {'version': version(a), 'assets': a}
    (ROOT / 'sw-assets.json').write_text(json.dumps(out, indent=2) + '\n')
    print(f'sw-assets.json: {len(a)} files, version {out["version"]}')
