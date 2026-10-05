"""HTTP API used by gOS (standard library only).

Run:  python3 -m gos_sc.server --config config.json
Apache forwards <gOS base>/sc-api/ to this server (see deploy/apache.conf).

GET  /health
GET  /catalogue
GET  /rna?dataset=&patient=                 RNA availability for a patient
GET  /genes?dataset=&patient=&q=            gene-name autocomplete
GET  /expression?dataset=&patient=&gene=    one gene across the patient's cells
POST /jobs                                  {analysis, dataset, groups|source_job, params, labels}
GET  /jobs?dataset=&patient=                analysis history
GET  /jobs/<id>                             status
GET  /jobs/<id>/result                      result table
"""

import argparse
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .config import Config, RequestError
from .jobs import JobStore
from .store import RnaCache, RnaMissing

PREFIX = "/sc-api"
MAX_BODY = 20 * 1024 * 1024


class Api:
    def __init__(self, config):
        self.config = config
        self.jobs = JobStore(config)
        self.rna_cache = RnaCache(config.raw.get("cache_patients", 8))

    def rna(self, q):
        folder = self.config.patient_folder(q.get("dataset"), q.get("patient"))
        return self.rna_cache.get(folder)

    def handle(self, method, path, q, body):
        parts = [p for p in path.split("/") if p]
        if method == "GET" and parts == ["health"]:
            return 200, {"ok": True}
        if method == "GET" and parts == ["catalogue"]:
            return 200, {"analyses": self.config.public_catalogue(),
                         "gene_sets": sorted(self.config.gene_sets)}
        if method == "GET" and parts == ["rna"]:
            try:
                rna = self.rna(q)
            except RnaMissing:
                return 200, {"available": False, "reason": "no rna/ folder for this patient"}
            matched = sum(1 for c in rna.cells if c.get("cell_id"))
            return 200, {"available": True, "n_cells": rna.n_cells, "n_genes": len(rna.genes),
                         "n_matched": matched, "manifest": rna.manifest}
        if method == "GET" and parts == ["genes"]:
            rna = self.rna(q)
            return 200, {"genes": rna.search_genes(q.get("q", ""), int(q.get("limit", 20)))}
        if method == "GET" and parts == ["expression"]:
            rna = self.rna(q)
            gene = q.get("gene", "")
            values = rna.dense(gene)
            if values is None:
                return 404, {"error": f"gene {gene!r} not found"}
            return 200, {
                "gene": rna.genes[rna.gene_index.get(gene, rna.gene_index.get(gene.upper()))],
                "ids": [rna.display_id(k) for k in range(rna.n_cells)],
                "values": [round(v, 4) for v in values],
            }
        if parts[:1] == ["jobs"]:
            if method == "POST" and len(parts) == 1:
                return 200, {"job": self.jobs.submit(body)}
            if method == "GET" and len(parts) == 1:
                return 200, {"jobs": self.jobs.history(q.get("dataset"), q.get("patient"))}
            if method == "GET" and len(parts) == 2:
                status = self.jobs.status(parts[1])
                return (200, {"job": status}) if status else (404, {"error": "no such job"})
            if method == "GET" and len(parts) == 3 and parts[2] == "result":
                result = self.jobs.result(parts[1])
                return (200, result) if result is not None else (404, {"error": "no result yet"})
        return 404, {"error": f"no route for {method} {path}"}


def make_handler(api):
    class Handler(BaseHTTPRequestHandler):
        server_version = "gos-sc-analysis/1"

        def log_message(self, fmt, *args):  # quieter default logging
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

        def _send(self, code, payload):
            data = json.dumps(payload, separators=(",", ":"), default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            origin = api.config.raw.get("allow_origin")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(data)

        def _dispatch(self, method):
            url = urlparse(self.path)
            path = url.path
            if path.startswith(PREFIX):
                path = path[len(PREFIX):] or "/"
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            body = None
            if method == "POST":
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BODY:
                    return self._send(413, {"error": "request too large"})
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    return self._send(400, {"error": "body is not valid JSON"})
            try:
                code, payload = api.handle(method, path, q, body)
            except RequestError as exc:
                code, payload = 400, {"error": str(exc)}
            except RnaMissing as exc:
                code, payload = 404, {"error": str(exc)}
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                code, payload = 500, {"error": f"{type(exc).__name__}: {exc}"}
            self._send(code, payload)

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_OPTIONS(self):
            self._send(204, {})

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description="gOS single-cell analysis service")
    parser.add_argument("--config", default=os.environ.get("GOS_SC_CONFIG", "config.json"))
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    args = parser.parse_args(argv)
    config = Config.load(args.config)
    host = args.host or config.raw["host"]
    port = args.port or config.raw["port"]
    server = ThreadingHTTPServer((host, port), make_handler(Api(config)))
    print(f"gos-sc-analysis listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
