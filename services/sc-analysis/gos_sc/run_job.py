"""Run one job folder: `python -m gos_sc.run_job <job_dir>`.

Executed by the local executor or inside a Slurm allocation. Built-in
analyses run in this process; command analyses (R in Singularity) run as a
subprocess that must write result.json into the job folder.
"""

import json
import os
import subprocess
import sys
import time
import traceback

from .analyses import BUILTINS
from .config import SERVICE_ROOT
from .jobs import read_json, write_status
from .store import PatientRna


class Context:
    def __init__(self, job_dir, manifest):
        self.job_dir = job_dir
        self.manifest = manifest
        self.request = manifest["request"]
        self.data_root = manifest["data_root"]
        self.missing = []
        self.groups = None
        self.source_result = None
        self.source_job_id = self.request.get("source_job")
        self._rna = {}

    def rna(self, patient):
        if patient not in self._rna:
            self._rna[patient] = PatientRna(os.path.join(self.data_root, patient))
        return self._rna[patient]

    def resolve_groups(self):
        groups = {}
        for side, entries in self.request["groups"].items():
            resolved = []
            for entry in entries:
                rna = self.rna(entry["patient"])
                cols, missing = rna.resolve(entry["cells"])
                self.missing.extend(missing)
                if cols:
                    resolved.append((rna, set(cols)))
            groups[side] = resolved
        self.groups = groups

    def load_source(self):
        root = self.data_root
        for folder in os.listdir(root):
            path = os.path.join(root, folder, "analyses", self.source_job_id, "result.json")
            if os.path.exists(path):
                self.source_result = read_json(path)
                return
        raise ValueError(f"source job {self.source_job_id} has no result")

    def gene_set_path(self, name):
        path = (self.manifest.get("gene_sets") or {}).get(name)
        if not path:
            raise ValueError(f"unknown gene-set collection {name!r}")
        return path


def run_command(job_dir, manifest):
    subs = {
        "job_dir": job_dir,
        "data_root": manifest["data_root"],
        "image": manifest.get("image") or "",
        "service_root": SERVICE_ROOT,
        "python": sys.executable,
    }
    cmd = [part.format(**subs) for part in manifest["command"]]
    with open(os.path.join(job_dir, "log.txt"), "a") as log:
        log.write("$ " + " ".join(cmd) + "\n")
        log.flush()
        proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"command exited with status {proc.returncode} (see log.txt)")
    result = read_json(os.path.join(job_dir, "result.json"))
    if result is None:
        raise RuntimeError("command finished without writing result.json")
    return result


def main(job_dir):
    job_dir = os.path.abspath(job_dir)
    manifest = read_json(os.path.join(job_dir, "request.json"))
    if manifest is None:
        print(f"no request.json in {job_dir}", file=sys.stderr)
        return 2
    write_status(job_dir, state="running", progress=0, message="starting", started=time.time())

    def report(progress=None, message=None):
        fields = {}
        if progress is not None:
            fields["progress"] = round(float(progress), 3)
        if message is not None:
            fields["message"] = message
        write_status(job_dir, **fields)

    try:
        analysis = manifest["request"]["analysis"]
        if manifest.get("command"):
            result = run_command(job_dir, manifest)
        else:
            module = BUILTINS[analysis]
            ctx = Context(job_dir, manifest)
            if "groups" in manifest["request"]:
                ctx.resolve_groups()
            if ctx.source_job_id:
                ctx.load_source()
            result = module.run(ctx, manifest["request"]["params"], report)
            result["labels"] = manifest.get("labels", {})
            with open(os.path.join(job_dir, "result.json.tmp"), "w") as fh:
                json.dump(result, fh, separators=(",", ":"))
            os.replace(os.path.join(job_dir, "result.json.tmp"), os.path.join(job_dir, "result.json"))
        n = len(result.get("genes") or result.get("terms") or [])
        write_status(job_dir, state="done", progress=1, finished=time.time(),
                     message=f"finished: {n} rows", summary=result.get("summary"))
        return 0
    except Exception as exc:  # noqa: BLE001 - every failure is reported to the UI
        with open(os.path.join(job_dir, "log.txt"), "a") as log:
            traceback.print_exc(file=log)
        write_status(job_dir, state="failed", message=str(exc), finished=time.time())
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
