"""Unit tests for build_gene_summaries.py parsers (synthetic fixtures only). python3 -m unittest discover scripts/singleCell/tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import build_gene_summaries as b  # noqa: E402


class T(unittest.TestCase):
    def test_gene_info(self):
        lines = ["#tax_id\tGeneID\tSymbol\tLocusTag\tSynonyms\tdbXrefs\tchromosome\tmap_location\tdescription\ttype_of_gene\n",
                 "9606\t1\tGENEA\t-\tGA|OLDA\tMIM:1|HGNC:HGNC:1|Ensembl:ENSG01\t1\t1p\tgene a\tprotein-coding\n"]
        g = b.parse_gene_info(lines)[0]
        self.assertEqual((g["symbol"], g["entrez"], g["ensembl"], g["synonyms"], g["type"]), ("GENEA", "1", "ENSG01", ["GA", "OLDA"], "protein-coding"))

    def test_uniprot_clean(self):
        t = "FUNCTION: Binds X (PubMed:1). {ECO:0000269|PubMed:1}. FUNCTION: [Isoform 2]: Does Y. {ECO:0000305}."
        self.assertEqual(b.clean_uniprot_function(t), "Binds X (PubMed:1). [Isoform 2]: Does Y.")
        by_id, by_sym = b.parse_uniprot_tsv("Entry\tGene\tGeneID\tFunction\nP1\tGENEA\t1;\tFUNCTION: Binds X. {ECO:1}.\nP2\tGENEB\t\t\n")
        self.assertEqual(by_id["1"]["accession"], "P1")
        self.assertNotIn("GENEB", by_sym)

    def test_curated_spans_two_columns(self):
        txt = "Entrez_Gene_ID\tHugo_Symbol\tIs_Oncogene\tIs_Tumor_Suppressor_Gene\tHighest_Level_of_Evidence_sensitivity\tHighest_Level_of_Evidence_resistance\tSummary_Background\n" \
              "1\tGENEA\tYes\tNo\t1\t\tOne sentence.\tBackground para.\n"
        c = b.parse_curated(txt)["GENEA"]
        self.assertEqual(c["text"], "One sentence. Background para.")
        self.assertTrue(c["oncogene"])
        self.assertEqual(c["level"], "1")

    def test_collect_symbols(self):
        acc = set()
        b.collect_symbols({"fusions": [{"gene1": "A,B", "gene2": "C::D", "x": {"gene": "E"}, "genes": ["F", {"gene": "G"}], "note": "H"}]}, acc)
        self.assertEqual(acc, set("ABCDEFG"))

    def test_choose_chain(self):
        cur = {"A": {"text": "onco"}}
        ncbi = {"2": {"summary": "ncbi"}}
        uni = {"3": {"accession": "P3", "text": "uni"}}
        self.assertEqual(b.choose("A", "1", cur, ncbi, uni, {})[1], "OncoKB")
        self.assertEqual(b.choose("B", "2", cur, ncbi, uni, {})[:2], ("ncbi", "NCBI Gene (RefSeq)"))
        self.assertEqual(b.choose("C", "3", cur, ncbi, uni, {})[2], "https://www.uniprot.org/uniprotkb/P3/entry")
        self.assertEqual(b.choose("D", "", cur, ncbi, uni, {}), (b.NOT_AVAILABLE, "none", ""))


if __name__ == "__main__":
    unittest.main()
