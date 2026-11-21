// Unit folder aliases: a combined report's cell records (e.g. pair GBM39c_GBM39_cluster0) reuse the files of their
// source unit (source_unit GBM39_cluster0). Per-cell file URLs resolve through `source_unit || pair`. The registry is
// filled when a patient's manifest records load; ids without an alias map to themselves. d3-free (jest).

const aliases = new Map();

/** Record the source unit of every manifest record that has one; returns the number of aliases. */
export function registerUnitSources(records) {
  (records || []).forEach((r) => {
    const id = r?.pair ?? r?.cell_id;
    if (id != null && r.source_unit && `${r.source_unit}` !== `${id}`) aliases.set(`${id}`, `${r.source_unit}`);
  });
  return aliases.size;
}

/** The folder holding an id's files (its source unit, or the id itself). */
export const resolveUnitFolder = (id) => (id == null ? id : aliases.get(`${id}`) || id);

/** Test hook. */
export const clearUnitSources = () => aliases.clear();
