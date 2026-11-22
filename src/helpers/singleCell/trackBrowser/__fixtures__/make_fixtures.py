"""Synthetic test fixtures for the track-browser jest tests (no real data).
Run: ~/miniconda3/envs/datac_atac/bin/python make_fixtures.py  (needs pyBigWig)."""
import struct, zlib, os
import pyBigWig

here = os.path.dirname(os.path.abspath(__file__))

# tiny.bw: chr1 (100 kb) bedGraph 1 kb bins value = bin index; chr2 (50 kb) fixedStep span 500 value 2.5; chrX varStep
bw = pyBigWig.open(os.path.join(here, "tiny.bw"), "w")
bw.addHeader([("chr1", 100000), ("chr2", 50000), ("chrX", 20000)], maxZooms=3)
starts = list(range(0, 100000, 1000))
bw.addEntries(["chr1"] * len(starts), starts, ends=[s + 1000 for s in starts], values=[float(i) for i in range(len(starts))])
bw.addEntries("chr2", 0, values=[2.5] * 100, span=500, step=500)
bw.addEntries("chrX", [100, 5000, 9000], values=[1.0, 3.0, 7.0], span=50)
bw.close()

# peaks.bed.gz: BGZF (two blocks + EOF block) narrowPeak
lines = [
    "chr1\t100\t600\tp1\t50\t.\t5.5\t10\t8\t250",
    "chr1\t5000\t5400\tp2\t20\t.\t2.1\t4\t3\t200",
    "chr2\t1000\t1300\tp3\t70\t.\t9.0\t12\t10\t150",
    "chr1\t2000\t90000\tbig\t10\t.\t1.0\t2\t1\t100",
]
def bgzf_block(data: bytes) -> bytes:
    comp = zlib.compressobj(6, zlib.DEFLATED, -15)
    cdata = comp.compress(data) + comp.flush()
    bsize = len(cdata) + 25
    header = b"\x1f\x8b\x08\x04" + b"\x00" * 4 + b"\x00\xff" + struct.pack("<H", 6) + b"BC" + struct.pack("<HH", 2, bsize)
    return header + cdata + struct.pack("<II", zlib.crc32(data) & 0xFFFFFFFF, len(data))
with open(os.path.join(here, "peaks.bed.gz"), "wb") as f:
    f.write(bgzf_block(("\n".join(lines[:2]) + "\n").encode()))
    f.write(bgzf_block(("\n".join(lines[2:]) + "\n").encode()))
    f.write(bgzf_block(b""))
print("ok")
