"""Read a patient's pre-analysed RNA (the `rna/` folder written by
r/export_seurat.R).

Layout, all little-endian:

    rna/manifest.json        {"format": "gos-sc-rna/1", "n_cells", "n_genes", ...}
    rna/cells.json           {"cells": [{"rna_id", "cell_id" | null, ...}, ...]}  matrix column order
    rna/genes.tsv            one gene symbol per line (first column used)
    rna/matrix.indptr.i32    int32, n_genes + 1     gene-major sparse (CSC over genes)
    rna/matrix.indices.i32   int32, nnz             cell index of each stored value
    rna/matrix.data.f32      float32, nnz           log-normalised expression

Gene g's non-zero values are data[indptr[g]:indptr[g+1]] at cells
indices[indptr[g]:indptr[g+1]]; every other cell is 0.
"""

import array
import json
import os
import sys
import threading
from collections import OrderedDict

FORMAT = "gos-sc-rna/1"


def _read_array(path, typecode):
    arr = array.array(typecode)
    with open(path, "rb") as fh:
        arr.frombytes(fh.read())
    if sys.byteorder != "little":
        arr.byteswap()
    return arr


class RnaMissing(Exception):
    pass


class PatientRna:
    def __init__(self, folder):
        self.folder = folder
        self.patient = os.path.basename(os.path.normpath(folder))
        rna = os.path.join(folder, "rna")
        manifest_path = os.path.join(rna, "manifest.json")
        if not os.path.exists(manifest_path):
            raise RnaMissing(f"no rna/manifest.json in {folder}")
        with open(manifest_path) as fh:
            self.manifest = json.load(fh)
        if self.manifest.get("format") != FORMAT:
            raise ValueError(f"unsupported RNA format {self.manifest.get('format')!r}")
        with open(os.path.join(rna, "cells.json")) as fh:
            cells = json.load(fh)
        self.cells = cells["cells"] if isinstance(cells, dict) else cells
        with open(os.path.join(rna, "genes.tsv")) as fh:
            self.genes = [line.rstrip("\n").split("\t")[0] for line in fh if line.strip()]
        self.indptr = _read_array(os.path.join(rna, "matrix.indptr.i32"), "i")
        self.indices = _read_array(os.path.join(rna, "matrix.indices.i32"), "i")
        self.data = _read_array(os.path.join(rna, "matrix.data.f32"), "f")
        if len(self.indptr) != len(self.genes) + 1:
            raise ValueError("matrix.indptr length does not match genes.tsv")
        if len(self.indices) != len(self.data) or self.indptr[-1] != len(self.data):
            raise ValueError("matrix indices/data lengths are inconsistent")
        self.gene_index = {}
        for k, g in enumerate(self.genes):
            self.gene_index.setdefault(g, k)
            self.gene_index.setdefault(g.upper(), k)
        self.column_of = {}
        for k, c in enumerate(self.cells):
            if c.get("rna_id") is not None:
                self.column_of.setdefault(str(c["rna_id"]), k)
        for k, c in enumerate(self.cells):  # gOS cell IDs win over RNA IDs
            if c.get("cell_id") is not None:
                self.column_of[str(c["cell_id"])] = k

    @property
    def n_cells(self):
        return len(self.cells)

    def gene(self, name):
        k = self.gene_index.get(name, self.gene_index.get(str(name).upper()))
        if k is None:
            return None
        lo, hi = self.indptr[k], self.indptr[k + 1]
        return self.indices[lo:hi], self.data[lo:hi]

    def dense(self, name):
        hit = self.gene(name)
        if hit is None:
            return None
        out = [0.0] * self.n_cells
        for i, v in zip(*hit):
            out[i] = v
        return out

    def resolve(self, ids):
        """Map gOS cell IDs or RNA IDs to matrix columns. Returns (columns, missing)."""
        cols, missing = [], []
        seen = set()
        for cid in ids:
            col = self.column_of.get(str(cid))
            if col is None:
                missing.append(cid)
            elif col not in seen:
                seen.add(col)
                cols.append(col)
        return cols, missing

    def display_id(self, col):
        c = self.cells[col]
        return c.get("cell_id") or c.get("rna_id")

    def search_genes(self, prefix, limit=20):
        p = prefix.upper()
        hits = [g for g in self.genes if g.upper().startswith(p)]
        hits.sort(key=lambda g: (len(g), g))
        return hits[:limit]


class RnaCache:
    """Keep the most recently used patients' matrices in memory."""

    def __init__(self, size=8):
        self.size = size
        self._items = OrderedDict()
        self._lock = threading.Lock()

    def get(self, folder):
        with self._lock:
            if folder in self._items:
                self._items.move_to_end(folder)
                return self._items[folder]
        loaded = PatientRna(folder)
        with self._lock:
            self._items[folder] = loaded
            while len(self._items) > self.size:
                self._items.popitem(last=False)
        return loaded


def write_patient_rna(folder, cells, genes, columns_by_gene, extra_manifest=None):
    """Write the rna/ layout from Python (used by the demo generator and tests).

    columns_by_gene: list (one per gene) of lists of (cell_index, value) pairs.
    """
    rna = os.path.join(folder, "rna")
    os.makedirs(rna, exist_ok=True)
    indptr = array.array("i", [0])
    indices = array.array("i")
    data = array.array("f")
    for entries in columns_by_gene:
        for i, v in sorted(entries):
            if v:
                indices.append(i)
                data.append(v)
        indptr.append(len(data))
    for arr in (indptr, indices, data):
        if sys.byteorder != "little":
            arr.byteswap()
    with open(os.path.join(rna, "matrix.indptr.i32"), "wb") as fh:
        fh.write(indptr.tobytes())
    with open(os.path.join(rna, "matrix.indices.i32"), "wb") as fh:
        fh.write(indices.tobytes())
    with open(os.path.join(rna, "matrix.data.f32"), "wb") as fh:
        fh.write(data.tobytes())
    with open(os.path.join(rna, "genes.tsv"), "w") as fh:
        fh.write("".join(f"{g}\n" for g in genes))
    with open(os.path.join(rna, "cells.json"), "w") as fh:
        json.dump({"cells": cells}, fh, separators=(",", ":"))
    manifest = {"format": FORMAT, "n_cells": len(cells), "n_genes": len(genes),
                "normalization": "LogNormalize"}
    manifest.update(extra_manifest or {})
    with open(os.path.join(rna, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
