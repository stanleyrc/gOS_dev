import json,sys,collections
import numpy as np
P=sys.argv[1]
d=json.load(open(f'/gpfs/commons/projects/imielinski_web/sclarke/gOS_GBM_sc/data/{P}/snv_matrix.json'))
V=d['variants'];cells=list(d['cells']);nS=len(V);nC=len(cells)
A=np.zeros((nC,nS),dtype=np.int16);D=np.zeros((nC,nS),dtype=np.int16);G=-np.ones((nC,nS),dtype=np.int8)
for i,c in enumerate(cells):
    for e in d['cells'][c]:
        D[i,e[0]]=e[1] or 0;A[i,e[0]]=e[2] or 0
        if len(e)>3 and e[3] is not None: G[i,e[0]]=e[3]
cat=np.array([v.get('category') for v in V]);cc=np.array([v.get('clade_cells') or 0 for v in V])
pos=A>0; call=(G==1)
priv=(cat=='private')
print(P,'private sites',priv.sum(),'clade_cells==1:',(cc[priv]==1).sum())
for name,m in (('any alt read',pos),('PL call gt==1',call),('alt>=2',A>=2)):
    n=m.sum(0)
    print(f' {name}: private sites carried by median {np.median(n[priv]):.0f} cells (truth 1); share carried by exactly 1 cell {(n[priv]==1).mean():.3f}; cells with >=1 private-site hit: of all positives in private columns, own-cell share = {priv.sum()/max(1,m[:,priv].sum())*1:.3f}')
# binned apparent: tree order by node, W px
node=np.array([v.get('node') if v.get('node') is not None else -1 for v in V]);order=np.argsort(node,kind='stable')
for W in (300,900):
  for name,m in (('any alt read',pos),('PL call',call)):
    per=nS/W;edges=np.unique(np.round(np.arange(0,W+1)*per).astype(int))
    r=[];fr=[]
    for a,b in zip(edges[:-1],edges[1:]):
        cols=order[a:b];pc=[c for c in cols if priv[c]]
        if pc:
            r.append(m[:,cols].any(1).sum()); 
    print(f' W={W} {name}: bins w/ private SNV {len(r)}, cells lit per bin median {np.median(r):.0f} of {nC}')
