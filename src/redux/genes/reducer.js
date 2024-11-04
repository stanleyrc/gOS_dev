import actions from "./actions";

const initState = {
  loading: false,
  filename: "genes/hg19.arrow",
  data: null,
  optionsList: [],
  geneTypes: [],
  geneTitles: [],
  genesStartPoint: [],
  genesEndPoint: [],
  genesY: [],
  genesColor: [],
  genesStrand: [],
  genesWeight: [],
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_GENES_DATA_REQUEST:
      return {
        ...state,
        data: null,
        optionsList: [],
        geneTypes: [],
        geneTitles: [],
        genesStartPoint: [],
        genesEndPoint: [],
        genesY: [],
        genesColor: [],
        genesStrand: [],
        genesWeight: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_GENES_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        optionsList: action.optionsList,
        geneTypes: action.geneTypes,
        geneTitles: action.geneTitles,
        genesStartPoint: action.genesStartPoint,
        genesEndPoint: action.genesEndPoint,
        genesY: action.genesY,
        genesColor: action.genesColor,
        genesStrand: action.genesStrand,
        genesWeight: action.genesWeight,
        loading: false,
      };
    case actions.FETCH_GENES_DATA_FAILED:
      return {
        ...state,
        data: null,
        optionsList: [],
        geneTypes: [],
        geneTitles: [],
        genesStartPoint: [],
        genesEndPoint: [],
        genesY: [],
        genesColor: [],
        genesStrand: [],
        genesWeight: [],
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
