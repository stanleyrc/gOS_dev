import re,sys
fa="/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/data/ref/Homo_sapiens_assembly38.fasta"
keep={f"chr{i}" for i in range(1,23)}
out=open("out/autosome_nonN.bed","w"); name=None; seq=[]
def flush():
    if name in keep:
        s="".join(seq).upper(); 
        for m in re.finditer(r"[^N]+",s): out.write(f"{name}\t{m.start()}\t{m.end()}\n")
for l in open(fa):
    if l[0]==">":
        flush(); name=l[1:].split()[0]; seq=[]
    elif name in keep: seq.append(l.strip())
flush()
