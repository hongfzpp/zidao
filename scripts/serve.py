#!/usr/bin/env python3
"""Dev server with caching disabled, optionally over HTTPS.

`python3 -m http.server` lets Safari cache ES modules, which means you can edit
a file, reload, and still be running the old code -- on the iPad especially,
where you cannot easily force-reload. That wastes a lot of time and makes bugs
look like they survived a fix. Everything here is served no-store.

HTTPS matters for one reason: the microphone. Speech recognition and getUserMedia
require a *secure context*. localhost counts as one, but the LAN address the iPad
uses does not, so 说说看 is silently unavailable on the device over plain http.

    ./scripts/serve.sh --https

generates a self-signed certificate (once, into .certs/) and serves over TLS.
Safari will warn about the certificate the first time: tap through
Details > Visit This Website. That is expected for a self-signed cert on a LAN.
"""
import http.server, socketserver, socket, ssl, subprocess, sys, pathlib

ARGS = [a for a in sys.argv[1:] if not a.startswith('-')]
PORT = int(ARGS[0]) if ARGS else 8181
USE_TLS = '--https' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent
CERT_DIR = ROOT / '.certs'
CERT, KEY = CERT_DIR / 'dev.crt', CERT_DIR / 'dev.key'


def ensure_cert(host):
    """Self-signed cert covering localhost and this machine's LAN address."""
    if CERT.exists() and KEY.exists():
        return
    CERT_DIR.mkdir(exist_ok=True)
    conf = CERT_DIR / 'openssl.cnf'
    conf.write_text(
        "[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n"
        "[dn]\nCN=zidao-dev\n"
        "[v3]\nbasicConstraints=CA:FALSE\nsubjectAltName=@alt\n"
        f"[alt]\nDNS.1=localhost\nIP.1=127.0.0.1\nIP.2={host}\n")
    subprocess.run(
        ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
         '-days', '825', '-keyout', str(KEY), '-out', str(CERT), '-config', str(conf)],
        check=True, capture_output=True)
    print(f'  generated a self-signed certificate in {CERT_DIR.name}/')


RESULTS_FILE = ROOT / '.test-results.json'


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_POST(self):
        """The headless test run posts its results here so a CLI can read them.
        Dev-server only; there is no production server."""
        if self.path != '/__results':
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length', 0))
        RESULTS_FILE.write_bytes(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):      # quieter
        if '200' not in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80)); return s.getsockname()[0]
    except Exception:
        return 'localhost'
    finally:
        s.close()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    host = lan_ip()
    scheme = 'https' if USE_TLS else 'http'
    if USE_TLS:
        try:
            ensure_cert(host)
        except Exception as e:
            print(f'  could not create a certificate ({e}); falling back to http')
            USE_TLS = False
            scheme = 'http'

    print(f'  desktop : {scheme}://localhost:{PORT}')
    print(f'  iPad    : {scheme}://{host}:{PORT}')
    print('  (no-store: edits always take effect on reload)')
    if USE_TLS:
        print('  Safari will warn about the self-signed certificate the first')
        print('  time: Details > Visit This Website. Needed for the microphone.')
    else:
        print('  http: the microphone (说说看) will NOT work on the iPad.')
        print('  Use ./scripts/serve.sh --https for that.')
    print()

    with Server(('', PORT), NoCache) as httpd:
        if USE_TLS:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
