import actions from "./actions";

const initState = {
  loading: false,
  filename: "genes/hg19.arrow",
  reference: "hg19",
  higlassServerPath: "https://higlass.io",
  maxGenomeLength: null,
  tilesetId: null,
  list: [],
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
  titlesColorMap: {},
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_HIGLASS_GENES_INFO_REQUEST:
      return {
        ...state,
        tilesetId: null,
        list: [],
        error: null,
        loading: true,
      };
    case actions.FETCH_HIGLASS_GENES_INFO_SUCCESS:
      return {
        ...state,
        tilesetId: action.tilesetId,
        maxGenomeLength: action.maxGenomeLength,
        list: [],
        loading: false,
      };
    case actions.FETCH_HIGLASS_GENES_INFO_FAILED:
      return {
        ...state,
        tilesetId: null,
        maxGenomeLength: null,
        list: [],
        error: action.error,
        loading: false,
      };
    case actions.FETCH_HIGLASS_GENES_DATA_REQUEST:
      return {
        ...state,
        error: null,
        loading: true,
      };
    case actions.FETCH_HIGLASS_GENES_DATA_SUCCESS:
      return {
        ...state,
        list: action.list,
        loading: false,
      };
    case actions.FETCH_HIGLASS_GENES_DATA_FAILED:
      return {
        ...state,
        list: [],
        error: action.error,
        loading: false,
      };
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
        titlesColorMap: {},
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
        titlesColorMap: action.titlesColorMap,
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
        titlesColorMap: {},
        error: action.error,
        loading: false,
      };
    default:
      return state;
  }
}
