"""Tests for the analysis service. Run from services/sc-analysis:

    python3 -m unittest discover -s tests -v
"""

import json
import math
import os
import random
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from itertools import combinations

from gos_sc import stats
from gos_sc.config import Config, RequestError
from gos_sc.jobs import JobStore
from gos_sc.server import Api, make_handler
from gos_sc.store import PatientRna, write_patient_rna


def naive_wilcoxon(a, b):
    """Reference rank-sum (normal approximation, tie + continuity correction)."""
    values = sorted([(v, 0) for v in a] + [(v, 1) for v in b])
    ranks = {}
    i = 0
    while i < len(values):
        j = i
        while j < len(values) and values[j][0] == values[i][0]:
            j += 1
        ranks[values[i][0]] = (i + 1 + j) / 2.0
        i = j
    n_a, n_b = len(a), len(b)
    n = n_a + n_b
    u = sum(ranks[v] for v in a) - n_a * (n_a + 1) / 2
    counts = {}
    for v, _ in values:
        counts[v] = counts.get(v, 0) + 1
    ties = sum(t ** 3 - t for t in counts.values())
    var = n_a * n_b / 12 * ((n + 1) - ties / (n * (n - 1)))
    d = u - n_a * n_b / 2
    z = (d - math.copysign(0.5, d) if d else 0) / math.sqrt(var)
    return math.erfc(abs(z) / math.sqrt(2))


class StatsTests(unittest.TestCase):
    def test_wilcoxon_matches_reference_with_zero_blocks(self):
        rng = random.Random(1)
        for _ in range(50):
            a = [round(rng.random() * 3, 1) if rng.random() < 0.6 else 0.0 for _ in range(rng.randint(3, 30))]
            b = [round(rng.random() * 2, 1) if rng.random() < 0.4 else 0.0 for _ in range(rng.randint(3, 30))]
            if len(set(a + b)) < 2:
                continue
            p, _ = stats.wilcoxon_ranksum([v for v in a if v], a.count(0.0),
                                          [v for v in b if v], b.count(0.0))
            self.assertAlmostEqual(p, naive_wilcoxon(a, b), places=10)

    def test_wilcoxon_auc_direction(self):
        _, auc = stats.wilcoxon_ranksum([5.0, 6.0, 7.0], 0, [1.0, 2.0], 0)
        self.assertEqual(auc, 1.0)

    def test_benjamini_hochberg(self):
        q = stats.benjamini_hochberg([0.01, 0.04, 0.03, 0.2])
        self.assertEqual([round(x, 4) for x in q], [0.04, 0.0533, 0.0533, 0.2])

    def test_hypergeometric_tail(self):
        def brute(k, N, K, n):
            total = math.comb(N, n)
            return sum(math.comb(K, x) * math.comb(N - K, n - x)
                       for x in range(k, min(K, n) + 1)) / total
        for args in [(3, 50, 10, 8), (0, 20, 5, 5), (5, 40, 5, 10), (1, 100, 2, 3)]:
            self.assertAlmostEqual(stats.hypergeom_sf(*args), brute(*args), places=12)


def make_patient(root, patient, n_cells=60, seed=0, shift_gene="MARKER1"):
    """Synthetic patient: first half of cells (clone A) over-express shift_gene."""
    rng = random.Random(seed)
    genes = [f"GENE{k}" for k in range(40)] + ["MARKER1", "MARKER2", "TP53", "EGFR"]
    cells = [{"rna_id": f"{patient}_bc{k}", "cell_id": f"{patient}-c{k:02d}" if k < n_cells - 4 else None,
              "clone_id": "A" if k < n_cells // 2 else "B"} for k in range(n_cells)]
    columns = []
    for g in genes:
        entries = []
        for k in range(n_cells):
            in_a = k < n_cells // 2
            base = 0.3
            if g == shift_gene and in_a:
                base = 0.95
            if g == "MARKER2" and not in_a:
                base = 0.9
            if rng.random() < base:
                level = 2.5 if (g == shift_gene and in_a) or (g == "MARKER2" and not in_a) else 0.8
                entries.append((k, round(rng.gauss(level, 0.3), 3)))
        columns.append(entries)
    folder = os.path.join(root, patient)
    os.makedirs(folder, exist_ok=True)
    write_patient_rna(folder, cells, genes, columns)
    return folder


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.data = os.path.join(cls.tmp, "data")
        make_patient(cls.data, "PT1", seed=1)
        make_patient(cls.data, "PT2", seed=2)
        os.makedirs(os.path.join(cls.data, "NORNA"))
        gmt = os.path.join(cls.tmp, "sets.gmt")
        with open(gmt, "w") as fh:
            fh.write("MARKERS\tna\tMARKER1\tGENE1\tGENE2\tGENE3\tGENE4\n")
            fh.write("RANDOM\tna\tGENE10\tGENE11\tGENE12\tGENE13\tGENE14\n")
        cls.config = Config({
            "datasets": {"demo": {"data_root": cls.data}},
            "gene_sets": {"demo": gmt},
            "executor": {"local": {"workers": 2}},
        }, base_dir=cls.tmp)
        cls.api = Api(cls.config)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.api))
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}/sc-api"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.tmp)

    def call(self, path, body=None):
        req = urllib.request.Request(self.base + path,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    def wait(self, job_id, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            _, payload = self.call(f"/jobs/{job_id}")
            if payload["job"]["state"] in ("done", "failed"):
                return payload["job"]
            time.sleep(0.2)
        self.fail("job did not finish")

    def groups(self, patient="PT1"):
        a = [f"{patient}-c{k:02d}" for k in range(30)]
        b = [f"{patient}-c{k:02d}" for k in range(30, 56)]
        return {"A": [{"patient": patient, "cells": a}], "B": [{"patient": patient, "cells": b}]}

    def test_store_roundtrip(self):
        rna = PatientRna(os.path.join(self.data, "PT1"))
        self.assertEqual(rna.n_cells, 60)
        self.assertIsNotNone(rna.gene("tp53"))
        cols, missing = rna.resolve(["PT1-c00", "PT1_bc59", "nope"])
        self.assertEqual(cols, [0, 59])
        self.assertEqual(missing, ["nope"])

    def test_catalogue_and_rna_endpoints(self):
        code, cat = self.call("/catalogue")
        self.assertEqual(code, 200)
        ids = [a["id"] for a in cat["analyses"]]
        self.assertIn("de_wilcoxon", ids)
        self.assertIn("enrichment_ora", ids)
        self.assertNotIn("command", json.dumps(cat))
        _, rna = self.call("/rna?dataset=demo&patient=PT1")
        self.assertTrue(rna["available"])
        self.assertEqual(rna["n_matched"], 56)
        _, none = self.call("/rna?dataset=demo&patient=NORNA")
        self.assertFalse(none["available"])
        _, genes = self.call("/genes?dataset=demo&patient=PT1&q=mark")
        self.assertEqual(genes["genes"], ["MARKER1", "MARKER2"])
        code, expr = self.call("/expression?dataset=demo&patient=PT1&gene=marker1")
        self.assertEqual(code, 200)
        self.assertEqual(len(expr["values"]), 60)
        self.assertEqual(expr["ids"][59], "PT1_bc59")

    def test_rejects_bad_requests(self):
        cases = [
            {"analysis": "nope", "dataset": "demo"},
            {"analysis": "de_wilcoxon", "dataset": "other", "groups": self.groups()},
            {"analysis": "de_wilcoxon", "dataset": "demo", "groups": {"A": []}},
            {"analysis": "de_wilcoxon", "dataset": "demo", "groups": self.groups(), "params": {"min_pct": 2}},
            {"analysis": "de_wilcoxon", "dataset": "demo", "groups": self.groups(), "params": {"bogus": 1}},
            {"analysis": "de_wilcoxon", "dataset": "demo",
             "groups": {"A": [{"patient": "../etc", "cells": ["x"]}], "B": [{"patient": "PT1", "cells": ["y"]}]}},
            {"analysis": "de_wilcoxon", "dataset": "demo",
             "groups": {"A": [{"patient": "PT1", "cells": ["PT1-c00"]}],
                        "B": [{"patient": "PT1", "cells": ["PT1-c00", "PT1-c01"]}]}},
        ]
        for body in cases:
            code, payload = self.call("/jobs", body)
            self.assertEqual(code, 400, (body, payload))
            self.assertIn("error", payload)

    def test_de_then_enrichment_end_to_end(self):
        code, payload = self.call("/jobs", {"analysis": "de_wilcoxon", "dataset": "demo",
                                            "groups": self.groups(), "labels": {"A": "clone A"}})
        self.assertEqual(code, 200)
        job = self.wait(payload["job"]["id"])
        self.assertEqual(job["state"], "done", job.get("message"))
        _, result = self.call(f"/jobs/{job['id']}/result")
        top = {g["gene"]: g for g in result["genes"]}
        self.assertEqual(result["genes"][0]["gene"] in ("MARKER1", "MARKER2"), True)
        self.assertGreater(top["MARKER1"]["avg_log2FC"], 1)
        self.assertLess(top["MARKER2"]["avg_log2FC"], -1)
        self.assertLess(top["MARKER1"]["p_val_adj"], 1e-3)
        self.assertEqual(result["labels"], {"A": "clone A"})
        self.assertTrue(os.path.exists(os.path.join(self.data, "PT1", "analyses", job["id"], "result.json")))

        # Same request (labels aside) -> same cached job, no rerun.
        _, again = self.call("/jobs", {"analysis": "de_wilcoxon", "dataset": "demo", "groups": self.groups()})
        self.assertEqual(again["job"]["id"], job["id"])
        self.assertEqual(again["job"]["state"], "done")

        _, enr = self.call("/jobs", {"analysis": "enrichment_ora", "dataset": "demo",
                                     "source_job": job["id"],
                                     "params": {"gene_set": "demo", "direction": "up",
                                                "q_cutoff": 0.05, "logfc_cutoff": 0.25, "min_size": 2}})
        ejob = self.wait(enr["job"]["id"])
        self.assertEqual(ejob["state"], "done", ejob.get("message"))
        _, eres = self.call(f"/jobs/{ejob['id']}/result")
        self.assertIn("MARKER1", eres["terms"][0]["genes"])

        _, hist = self.call("/jobs?dataset=demo&patient=PT1")
        self.assertGreaterEqual(len(hist["jobs"]), 2)

    def test_cross_patient_job_goes_to_cohort_folder_with_warning(self):
        groups = {"A": [{"patient": "PT1", "cells": [f"PT1-c{k:02d}" for k in range(30)]},
                        {"patient": "PT2", "cells": [f"PT2-c{k:02d}" for k in range(30)]}],
                  "B": [{"patient": "PT1", "cells": [f"PT1-c{k:02d}" for k in range(30, 56)]},
                        {"patient": "PT2", "cells": [f"PT2-c{k:02d}" for k in range(30, 56)]}]}
        _, payload = self.call("/jobs", {"analysis": "de_wilcoxon", "dataset": "demo", "groups": groups})
        job = self.wait(payload["job"]["id"])
        self.assertEqual(job["state"], "done", job.get("message"))
        self.assertTrue(os.path.isdir(os.path.join(self.data, "_cohort", "analyses", job["id"])))
        _, result = self.call(f"/jobs/{job['id']}/result")
        self.assertTrue(any("pooled" in w for w in result["summary"]["warnings"]))
        _, hist = self.call("/jobs?dataset=demo&patient=PT2")
        self.assertIn(job["id"], [j["id"] for j in hist["jobs"]])

    def test_failed_job_reports_message(self):
        groups = {"A": [{"patient": "PT1", "cells": ["PT1-c00"]}],
                  "B": [{"patient": "PT1", "cells": ["PT1-c40"]}]}
        _, payload = self.call("/jobs", {"analysis": "de_wilcoxon", "dataset": "demo", "groups": groups})
        job = self.wait(payload["job"]["id"])
        self.assertEqual(job["state"], "failed")
        self.assertIn("at least", job["message"])


class ConfigTests(unittest.TestCase):
    def test_command_analysis_needs_image_config(self):
        cfg = Config({"datasets": {}, "analyses": {"de_seurat": {"image": "/x.sif"}}})
        self.assertIn("de_seurat", cfg.catalogue)
        self.assertEqual(cfg.catalogue["de_seurat"]["kind"], "command")
        self.assertNotIn("de_pseudobulk", cfg.catalogue)

    def test_param_validation(self):
        cfg = Config({"datasets": {}})
        spec = cfg.catalogue["de_wilcoxon"]
        self.assertEqual(cfg.validate_params(spec, {})["min_pct"], 0.1)
        with self.assertRaises(RequestError):
            cfg.validate_params(spec, {"min_cells_per_group": 2.5})


if __name__ == "__main__":
    unittest.main()


class SlurmExecutorTests(unittest.TestCase):
    """Runs the Slurm path with stand-in sbatch/squeue scripts."""

    def test_slurm_job_runs_and_lost_job_fails(self):
        tmp = tempfile.mkdtemp()
        try:
            data = os.path.join(tmp, "data")
            make_patient(data, "PT1", seed=3)
            bin_dir = os.path.join(tmp, "bin")
            os.makedirs(bin_dir)
            sbatch = os.path.join(bin_dir, "sbatch")
            with open(sbatch, "w") as fh:
                fh.write('#!/bin/bash\nscript="${@: -1}"\n'
                         'if [ -n "$FAKE_SLURM_DROP" ]; then echo 4242; exit 0; fi\n'
                         'bash "$script" > /dev/null 2>&1 &\necho 4242\n')
            squeue = os.path.join(bin_dir, "squeue")
            with open(squeue, "w") as fh:
                fh.write("#!/bin/bash\nexit 0\n")  # job no longer in the queue
            for p in (sbatch, squeue):
                os.chmod(p, 0o755)
            import sys as _sys
            cfg = Config({"datasets": {"demo": {"data_root": data}},
                          "executor": {"default": "slurm",
                                       "slurm": {"sbatch": sbatch, "squeue": squeue,
                                                 "python": _sys.executable,
                                                 "args": ["--time=00:10:00"]}}})
            store = JobStore(cfg)
            groups = {"A": [{"patient": "PT1", "cells": [f"PT1-c{k:02d}" for k in range(30)]}],
                      "B": [{"patient": "PT1", "cells": [f"PT1-c{k:02d}" for k in range(30, 56)]}]}
            # de_wilcoxon defaults to the local executor; force Slurm for this test.
            cfg.catalogue["de_wilcoxon"]["executor"] = "slurm"
            job = store.submit({"analysis": "de_wilcoxon", "dataset": "demo", "groups": groups})
            self.assertEqual(job["slurm_job_id"], "4242")
            deadline = time.time() + 60
            while time.time() < deadline and store.status(job["id"])["state"] not in ("done", "failed"):
                time.sleep(0.3)
            self.assertEqual(store.status(job["id"])["state"], "done")
            script = open(os.path.join(store.find(job["id"]), "job.sh")).read()
            self.assertIn("#SBATCH --time=00:10:00", script)

            os.environ["FAKE_SLURM_DROP"] = "1"
            try:
                lost = store.submit({"analysis": "de_wilcoxon", "dataset": "demo", "groups": groups,
                                     "params": {"min_pct": 0.2}})
            finally:
                del os.environ["FAKE_SLURM_DROP"]
            status = store.status(lost["id"])
            self.assertEqual(status["state"], "failed")
            self.assertIn("Slurm", status["message"])
        finally:
            shutil.rmtree(tmp)
