"""Service configuration, analysis catalogue and request validation."""

import copy
import json
import os
import re

from .analyses import BUILTINS, COMMAND_TEMPLATES

SERVICE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MAX_CELLS_PER_GROUP = 200_000


class RequestError(ValueError):
    """A request the caller can fix (HTTP 400)."""


DEFAULTS = {
    "host": "127.0.0.1",
    "port": 8787,
    "allow_origin": None,
    "datasets": {},
    "gene_sets": {},
    "executor": {
        "default": "local",
        "local": {"workers": 2, "timeout_s": 3600},
        "slurm": {"python": "python3", "sbatch": "sbatch", "squeue": "squeue", "args": []},
    },
    "analyses": {},
    "cache_patients": 8,
}


def _merge(base, extra):
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


class Config:
    def __init__(self, raw, base_dir=None):
        self.raw = _merge(DEFAULTS, raw)
        self.base_dir = base_dir or os.getcwd()
        self.datasets = {}
        for ds_id, ds in self.raw["datasets"].items():
            if not SAFE_ID.match(ds_id):
                raise ValueError(f"bad dataset id {ds_id!r}")
            root = ds["data_root"] if isinstance(ds, dict) else ds
            self.datasets[ds_id] = os.path.abspath(os.path.join(self.base_dir, root))
        self.gene_sets = {
            name: os.path.abspath(os.path.join(self.base_dir, path))
            for name, path in self.raw["gene_sets"].items()
        }
        self.catalogue = self._build_catalogue()

    @classmethod
    def load(cls, path):
        with open(path) as fh:
            raw = json.load(fh)
        return cls(raw, base_dir=os.path.dirname(os.path.abspath(path)))

    # -- catalogue -------------------------------------------------------
    def _build_catalogue(self):
        entries = {}
        for name, module in BUILTINS.items():
            spec = copy.deepcopy(module.SPEC)
            spec.update({"id": name, "kind": "builtin"})
            entries[name] = spec
        for name, override in self.raw["analyses"].items():
            if not SAFE_ID.match(name):
                raise ValueError(f"bad analysis id {name!r}")
            if override is False or (isinstance(override, dict) and override.get("enabled") is False):
                entries.pop(name, None)
                continue
            base = copy.deepcopy(entries.get(name) or COMMAND_TEMPLATES.get(name) or {})
            spec = _merge(base, override)
            spec["id"] = name
            spec.setdefault("kind", "builtin" if name in BUILTINS else "command")
            if spec["kind"] == "command" and not spec.get("command"):
                raise ValueError(f"analysis {name} needs a command")
            entries[name] = spec
        for spec in entries.values():
            for p in spec.get("params", {}).values():
                if p.get("options") == "$gene_sets":
                    p["options"] = sorted(self.gene_sets)
                    if p["options"] and "default" not in p:
                        p["default"] = p["options"][0]
        # Enrichment is pointless without gene sets.
        if not self.gene_sets:
            entries.pop("enrichment_ora", None)
        return entries

    def public_catalogue(self):
        hidden = {"command", "image"}
        return [
            {k: v for k, v in spec.items() if k not in hidden}
            for spec in sorted(self.catalogue.values(), key=lambda s: s["id"])
        ]

    # -- paths -----------------------------------------------------------
    def data_root(self, dataset):
        if dataset not in self.datasets:
            raise RequestError(f"unknown dataset {dataset!r}")
        return self.datasets[dataset]

    def patient_folder(self, dataset, patient):
        if not isinstance(patient, str) or not SAFE_ID.match(patient):
            raise RequestError(f"bad patient id {patient!r}")
        folder = os.path.join(self.data_root(dataset), patient)
        if not os.path.isdir(folder):
            raise RequestError(f"no case folder for {patient!r}")
        return folder

    def gene_set_path(self, name):
        if name not in self.gene_sets:
            raise RequestError(f"unknown gene-set collection {name!r}")
        return self.gene_sets[name]

    # -- params ------------------------------------------------------------
    def validate_params(self, spec, given):
        given = given or {}
        unknown = set(given) - set(spec.get("params", {}))
        if unknown:
            raise RequestError(f"unknown parameters: {', '.join(sorted(unknown))}")
        out = {}
        for name, p in spec.get("params", {}).items():
            value = given.get(name, p.get("default"))
            if value is None:
                raise RequestError(f"parameter {name} is required")
            kind = p.get("type")
            try:
                if kind == "number":
                    value = float(value)
                elif kind == "integer":
                    if float(value) != int(float(value)):
                        raise ValueError
                    value = int(float(value))
                elif kind == "boolean":
                    if not isinstance(value, bool):
                        raise ValueError
                elif kind == "enum":
                    if value not in p.get("options", []):
                        raise ValueError
            except (TypeError, ValueError):
                raise RequestError(f"invalid value for {name}: {value!r}") from None
            if kind in ("number", "integer"):
                if "min" in p and value < p["min"] or "max" in p and value > p["max"]:
                    raise RequestError(f"{name} must be between {p.get('min')} and {p.get('max')}")
            out[name] = value
        return out


def normalize_groups(config, dataset, groups):
    """Validate {"A": [{"patient", "cells"}], "B": [...]} and return a canonical form."""
    if not isinstance(groups, dict) or set(groups) != {"A", "B"}:
        raise RequestError("groups must have exactly the keys A and B")
    out = {}
    seen = {}
    for side in ("A", "B"):
        entries = groups[side]
        if not isinstance(entries, list) or not entries:
            raise RequestError(f"group {side} is empty")
        merged = {}
        for entry in entries:
            if not isinstance(entry, dict) or "patient" not in entry or "cells" not in entry:
                raise RequestError("each group entry needs a patient and a list of cells")
            config.patient_folder(dataset, entry["patient"])
            cells = entry["cells"]
            if not isinstance(cells, list) or not all(isinstance(c, str) for c in cells):
                raise RequestError("cells must be a list of strings")
            merged.setdefault(entry["patient"], set()).update(cells)
        total = sum(len(c) for c in merged.values())
        if total == 0:
            raise RequestError(f"group {side} has no cells")
        if total > MAX_CELLS_PER_GROUP:
            raise RequestError(f"group {side} is too large")
        for patient, cells in merged.items():
            overlap = seen.get(patient, set()) & cells
            if overlap:
                raise RequestError(f"{len(overlap)} cells are in both groups")
            seen.setdefault(patient, set()).update(cells)
        out[side] = [{"patient": p, "cells": sorted(c)} for p, c in sorted(merged.items())]
    return out
