suppressMessages(library(jsonlite)); suppressMessages(library(data.table))
D="/gpfs/commons/projects/imielinski_web/sclarke/gOS_GBM_sc/data"
x=as.data.table(readRDS("/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/db/all_pairs_slim.rds"))
out=list()
for (p in c("BWH69","BWH70","MGH302","MGH303","MGH304","MGH305")) {
  cells=names(fromJSON(file.path(D,p,"snv_matrix.json"),simplifyVector=FALSE)$cells)
  y=x[match(cells,pair),.(pair=cells,patient=p,bam_cram,depth,breadth,ploidy=NA)]
  out[[p]]=y
}
o=rbindlist(out)
o[,cram:=ifelse(grepl("\\.(cram|bam)$",bam_cram),bam_cram,paste0(bam_cram,".cram"))]
o[,exists:=file.exists(cram)]
print(o[,.(n=.N,has_path=sum(!is.na(bam_cram)),exists=sum(exists)),by=patient])
fwrite(o[,.(pair,patient,cram,depth,breadth)],"out/cell_cram_table.tsv",sep="\t")
