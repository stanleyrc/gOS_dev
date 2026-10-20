import { createContext, useContext } from "react";
import { lettersLabel } from "../../../helpers/singleCell/paperManifest";

/** Paper letters of the interactive panels (Map from paperManifest.panelLettersById), provided by the Figures view. */
export const PaperLettersContext = createContext(null);

/** { letter, label } of an interactive panel id in the current paper, or null when the paper has no such panel. */
export function usePaperLetters(id) {
  const map = useContext(PaperLettersContext);
  const e = id && map ? map.get(id) : null;
  return e?.length ? { letter: e[0].letter, label: lettersLabel(e) } : null;
}
