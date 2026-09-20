#!/usr/bin/env python3
"""Run the FULL suite (unit + data + e2e) in headless Chrome, from the CLI.

The E2E tests drive the real app in an iframe, so they need a real browser.
Chrome is launched headless pointing at the test page with ?post=1; the page
posts its results back to our own dev server, which writes them to
.test-results.json. No driver, no websocket client, no extra dependency.
"""
import json, os, pathlib, shutil, signal, subprocess, sys, tempfile, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / '.test-results.json'
PORT = os.environ.get('PORT', '8181')
URL = f'http://localhost:{PORT}/tests/index.html?post=1'
TIMEOUT = int(os.environ.get('TEST_TIMEOUT', '180'))

CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    shutil.which('google-chrome') or '',
    shutil.which('chromium') or '',
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if p and pathlib.Path(p).exists():
            return p
    return None


def server_up():
    try:
        urllib.request.urlopen(f'http://localhost:{PORT}/index.html', timeout=2)
        return True
    except Exception:
        return False


def main():
    chrome = find_chrome()
    if not chrome:
        print('No Chrome/Chromium found. Open this in a browser instead:')
        print(f'  {URL.replace("?post=1", "")}')
        return 2

    # Start a dev server ourselves if one is not already up, so the suite is a
    # single command.
    own_server = None
    if not server_up():
        own_server = subprocess.Popen(
            [sys.executable, str(ROOT / 'scripts' / 'serve.py'), PORT],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            if server_up():
                break
            time.sleep(0.25)
        else:
            own_server.kill()
            print(f'Could not start a dev server on port {PORT}.')
            return 2

    RESULTS.unlink(missing_ok=True)
    profile = tempfile.mkdtemp(prefix='zidao-chrome-')
    proc = subprocess.Popen(
        [chrome, '--headless=new', '--disable-gpu', '--no-first-run',
         '--no-default-browser-check', '--disable-extensions',
         '--autoplay-policy=no-user-gesture-required',
         '--window-size=1200,900', f'--user-data-dir={profile}', URL],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f'running full suite in headless Chrome (timeout {TIMEOUT}s)...')
    t0 = time.time()
    try:
        while time.time() - t0 < TIMEOUT:
            if RESULTS.exists():
                break
            if proc.poll() is not None and not RESULTS.exists():
                time.sleep(1)
                break
            time.sleep(0.25)
    finally:
        proc.send_signal(signal.SIGTERM)
        try: proc.wait(timeout=10)
        except subprocess.TimeoutExpired: proc.kill()
        shutil.rmtree(profile, ignore_errors=True)
        if own_server:
            own_server.terminate()
            try: own_server.wait(timeout=5)
            except subprocess.TimeoutExpired: own_server.kill()

    if not RESULTS.exists():
        print(f'FAILED: no results after {TIMEOUT}s (the suite hung or Chrome died)')
        return 1

    r = json.loads(RESULTS.read_text())
    if not r.get('suites') and r.get('failures'):
        print('\033[31mTest files failed to load:\033[0m')
        for f in r['failures']:
            print('  ' + f)
        return 1
    elapsed = time.time() - t0
    G, R, D, X = '\033[32m', '\033[31m', '\033[2m', '\033[0m'
    for s in r['suites']:
        bad = s['total'] - s['passed']
        print(f"{R + 'x' if bad else G + 'ok'} {s['name']}{X} {D}{s['passed']}/{s['total']}{X}")
    for f in r.get('failures', []):
        print(f'\n{R}FAIL{X} {f}')
    if os.environ.get('SLOW'):
        print(f'\n{D}slowest:{X}')
        for t in r.get('slowest', []):
            print(f"  {t['ms']:>6} ms  {t['name']}")
    print()
    print((f"{G}{r['passed']}/{r['total']} passed{X}" if r['ok']
           else f"{R}{r['failed']} FAILED{X} ({r['passed']}/{r['total']} passed)")
          + f'  {D}{elapsed:.1f}s{X}')
    return 0 if r['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
