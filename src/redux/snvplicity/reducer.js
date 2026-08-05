import actions from "./actions";

const initState = {
  loading: false,
  data: null,
  imageFile: "multiplicity.png",
  imagePresent: false,
  imageError: null,
  purpleSunrisePresent: false,
  purpleSunriseError: null,
  hetsnpsImagePresent: false,
  hetsnpsImageError: null,
  error: null,
  missing: false,
};

const assetState = (action) => ({
  imagePresent: action.imagePresent || false,
  imageError: action.imageError || null,
  purpleSunrisePresent: action.purpleSunrisePresent || false,
  purpleSunriseError: action.purpleSunriseError || null,
  hetsnpsImagePresent: action.hetsnpsImagePresent || false,
  hetsnpsImageError: action.hetsnpsImageError || null,
});

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_SNVPLICITY_DATA_REQUEST:
      return {
        ...state,
        error: null,
        data: null,
        ...assetState({}),
        loading: true,
        missing: false,
      };
    case actions.FETCH_SNVPLICITY_DATA_SUCCESS:
      return {
        ...state,
        data: action.data,
        error: null,
        ...assetState(action),
        loading: false,
        missing: false,
      };
    case actions.FETCH_SNVPLICITY_DATA_MISSING:
      return {
        ...state,
        data: null,
        error: null,
        ...assetState(action),
        loading: false,
        missing: true,
      };
    case actions.FETCH_SNVPLICITY_DATA_FAILED:
      return {
        ...state,
        error: action.error,
        data: null,
        ...assetState(action),
        loading: false,
        missing: false,
      };
    default:
      return state;
  }
}
