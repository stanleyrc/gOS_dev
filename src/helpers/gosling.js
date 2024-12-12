/**
 * Filter a DataFrame based on a boolean mask and return matching IDs
 * @param {DataFrame} df - DanfoJS DataFrame to filter
 * @param {Object} mask - Object containing boolean mask for filtering
 * @param {Series} mask.rows - Boolean Series for row filtering
 * @param {Array} [mask.columns] - Optional array of column indices to select
 * @returns {Array} Array of IDs from filtered DataFrame
 */
export function filterDataFrame(df, mask) {
  if (!df || !mask || !mask.rows) {
    return [];
  }
  try {
    console.log('GPT generated filter: ', mask)
    const expression = eval(mask.rows)
    const filteredDf = df.iloc({ rows: expression });
    const ids = filteredDf['id'].values;
    return [...new Set(ids)];
  } catch (error) {
    console.error('Error filtering DataFrame:', error);
    return [];
  }
}
