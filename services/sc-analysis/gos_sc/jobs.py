"""Job creation, caching, status and executors (local workers or Slurm).

A job lives in a folder inside the case folders, so its results are plain
files next to the data they came from:

    <data_root>/<patient>/analyses/<job_id>/   single-patient jobs
    <data_root>/_cohort/analyses/<job_id>/     jobs spanning patients

    request.json   canonical request + everything the runner needs
    status.json    state: queued | running | done | failed, progress, message
    result.json    the analysis output gOS draws
    log.txt        runner log (and slurm.out for Slurm jobs)

The job ID is a hash of the canonical request, so asking for the same
analysis on the same cells with the same parameters returns the cached job.
"""

import glob
import hashlib
import json
import os
import shlex
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from .config import SERVICE_ROOT, RequestError, normalize_groups

COHORT_FOLDER = "_cohort"
TERMINAL = {"done", "failed"}


def _write_json(path, payload):
    tmp = f"{path}.tmp-{os.getpid()}-{threading.get_ident()}"
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=1, default=str)
    os.replace(tmp, path)


def read_json(path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_status(job_dir, **fields):
    path = os.path.join(job_dir, "status.json")
    status = read_json(path, {}) or {}
    status.update(fields)
    status["updated"] = time.time()
    _write_json(path, status)
    return status


class LocalExecutor:
    name = "local"

    def __init__(self, workers=2, timeout_s=3600):
        self.pool = ThreadPoolExecutor(max_workers=max(1, int(workers)))
        self.timeout_s = timeout_s

    def submit(self, job_dir):
        self.pool.submit(self._run, job_dir)
        return {"executor": "local"}

    def _run(self, job_dir):
        log = open(os.path.join(job_dir, "log.txt"), "a")
        try:
            subprocess.run(
                [sys.executable, "-m", "gos_sc.run_job", job_dir],
                cwd=SERVICE_ROOT,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=self.timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired:
            write_status(job_dir, state="failed", message=f"timed out after {self.timeout_s}s")
        finally:
            log.close()
        status = read_json(os.path.join(job_dir, "status.json"), {})
        if status.get("state") not in TERMINAL:
            write_status(job_dir, state="failed", message="runner exited without a result (see log.txt)")

    def refresh(self, job_dir, status):
        return status


class SlurmExecutor:
    name = "slurm"

    def __init__(self, python="python3", sbatch="sbatch", squeue="squeue", args=None):
        self.python = python
        self.sbatch = sbatch
        self.squeue = squeue
        self.args = list(args or [])

    def submit(self, job_dir):
        script = os.path.join(job_dir, "job.sh")
        job_id = os.path.basename(job_dir)
        lines = [
            "#!/bin/bash",
            f"#SBATCH --job-name=gos-{job_id}",
            f"#SBATCH --output={os.path.join(job_dir, 'slurm.out')}",
            *[f"#SBATCH {a}" for a in self.args],
            f"cd {shlex.quote(SERVICE_ROOT)}",
            f"exec {shlex.quote(self.python)} -m gos_sc.run_job {shlex.quote(job_dir)}",
            "",
        ]
        with open(script, "w") as fh:
            fh.write("\n".join(lines))
        out = subprocess.run([self.sbatch, "--parsable", script], capture_output=True, text=True)
        if out.returncode != 0:
            raise RuntimeError(f"sbatch failed: {out.stderr.strip()}")
        return {"executor": "slurm", "slurm_job_id": out.stdout.strip().split(";")[0]}

    def refresh(self, job_dir, status):
        """Fail jobs that left the queue without writing a final status."""
        if status.get("state") in TERMINAL or not status.get("slurm_job_id"):
            return status
        out = subprocess.run([self.squeue, "-h", "-j", status["slurm_job_id"], "-o", "%T"],
                             capture_output=True, text=True)
        if out.returncode == 0 and not out.stdout.strip():
            time.sleep(1)  # the runner may be finishing its last write
            status = read_json(os.path.join(job_dir, "status.json"), status)
            if status.get("state") not in TERMINAL:
                status = write_status(job_dir, state="failed",
                                      message="Slurm job ended without a result (see slurm.out)")
        return status


class JobStore:
    def __init__(self, config):
        self.config = config
        ex = config.raw["executor"]
        self.executors = {
            "local": LocalExecutor(**ex.get("local", {})),
            "slurm": SlurmExecutor(**ex.get("slurm", {})),
        }
        self.default_executor = ex.get("default", "local")
        self._lock = threading.Lock()
        self._index = {}

    # -- creation ----------------------------------------------------------
    def canonical_request(self, body):
        if not isinstance(body, dict):
            raise RequestError("request body must be a JSON object")
        analysis = body.get("analysis")
        spec = self.config.catalogue.get(analysis)
        if not spec:
            raise RequestError(f"unknown analysis {analysis!r}")
        dataset = body.get("dataset")
        self.config.data_root(dataset)
        req = {
            "analysis": analysis,
            "version": spec.get("version", "1"),
            "dataset": dataset,
            "params": self.config.validate_params(spec, body.get("params")),
        }
        inputs = spec.get("inputs", [])
        if "groups" in inputs:
            req["groups"] = normalize_groups(self.config, dataset, body.get("groups"))
        if "source_job" in inputs:
            source = body.get("source_job")
            if not isinstance(source, str) or not self.find(source):
                raise RequestError("source_job must be an existing job id")
            req["source_job"] = source
        return req, spec

    def job_id(self, req):
        canonical = json.dumps(req, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()[:20]

    def home_folder(self, req):
        root = self.config.data_root(req["dataset"])
        if "source_job" in req:
            source_dir = self.find(req["source_job"])
            return os.path.dirname(os.path.dirname(source_dir))
        patients = sorted({e["patient"] for side in req["groups"].values() for e in side})
        if len(patients) == 1:
            return os.path.join(root, patients[0])
        return os.path.join(root, COHORT_FOLDER)

    def submit(self, body):
        req, spec = self.canonical_request(body)
        job_id = self.job_id(req)
        with self._lock:
            existing = self.find(job_id)
            if existing:
                status = self.status(job_id)
                if status.get("state") != "failed":
                    return status
                job_dir = existing  # rerun a failed job in place
            else:
                job_dir = os.path.join(self.home_folder(req), "analyses", job_id)
                os.makedirs(job_dir, exist_ok=True)
                self._index[job_id] = job_dir
            for name in ("result.json", "log.txt", "slurm.out"):
                try:
                    os.remove(os.path.join(job_dir, name))
                except FileNotFoundError:
                    pass
            executor_name = spec.get("executor", self.default_executor)
            if executor_name not in self.executors:
                executor_name = self.default_executor
            manifest = {
                "id": job_id,
                "request": req,
                "labels": body.get("labels") or {},
                "spec": {k: spec[k] for k in ("id", "title", "kind", "version") if k in spec},
                "command": spec.get("command"),
                "image": spec.get("image"),
                "data_root": self.config.data_root(req["dataset"]),
                "gene_sets": self.config.gene_sets,
                "executor": executor_name,
                "created": time.time(),
            }
            _write_json(os.path.join(job_dir, "request.json"), manifest)
            write_status(job_dir, id=job_id, state="queued", progress=0, message="queued",
                         analysis=req["analysis"], created=manifest["created"])
        try:
            info = self.executors[executor_name].submit(job_dir)
        except Exception as exc:  # noqa: BLE001 - surface any submission failure
            return write_status(job_dir, state="failed", message=str(exc))
        return write_status(job_dir, **info)

    # -- lookup --------------------------------------------------------------
    def find(self, job_id):
        if not isinstance(job_id, str) or not job_id.isalnum() or len(job_id) > 64:
            return None
        with_lock = self._index.get(job_id)
        if with_lock and os.path.isdir(with_lock):
            return with_lock
        for root in self.config.datasets.values():
            hits = glob.glob(os.path.join(root, "*", "analyses", job_id))
            if hits:
                self._index[job_id] = hits[0]
                return hits[0]
        return None

    def status(self, job_id):
        job_dir = self.find(job_id)
        if not job_dir:
            return None
        status = read_json(os.path.join(job_dir, "status.json"), {}) or {}
        executor = self.executors.get(status.get("executor"))
        if executor:
            status = executor.refresh(job_dir, status)
        manifest = read_json(os.path.join(job_dir, "request.json"), {}) or {}
        status["id"] = job_id
        status["request"] = manifest.get("request")
        status["labels"] = manifest.get("labels", {})
        status["title"] = (manifest.get("spec") or {}).get("title")
        return status

    def result(self, job_id):
        job_dir = self.find(job_id)
        if not job_dir:
            return None
        return read_json(os.path.join(job_dir, "result.json"))

    def history(self, dataset, patient=None, limit=50):
        root = self.config.data_root(dataset)
        folders = [self.config.patient_folder(dataset, patient)] if patient else [
            os.path.join(root, COHORT_FOLDER)]
        if patient:
            folders.append(os.path.join(root, COHORT_FOLDER))
        items = []
        for folder in folders:
            for job_dir in glob.glob(os.path.join(folder, "analyses", "*")):
                job_id = os.path.basename(job_dir)
                status = self.status(job_id)
                if not status:
                    continue
                req = status.get("request") or {}
                if patient and os.path.basename(folder) == COHORT_FOLDER:
                    involved = {e["patient"] for s in (req.get("groups") or {}).values() for e in s}
                    if patient not in involved:
                        continue
                items.append(status)
        items.sort(key=lambda s: s.get("created") or 0, reverse=True)
        return items[:limit]
