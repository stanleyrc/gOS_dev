/**
 * Filter a DataFrame based on provided filter conditions and return matching IDs
 * @param {DataFrame} df - DanfoJS DataFrame to filter
 * @param {Object} filter - Object containing filter conditions
 * @param {string} filter.column - Column name to filter on
 * @param {string} filter.operator - Operator to use ('eq', 'gt', 'lt', 'contains', etc)
 * @param {any} filter.value - Value to filter by
 * @returns {Array} Array of IDs from filtered DataFrame
 */
export function filterDataFrame(df, filter) {
  if (!df || !filter) {
    return [];
  }

  try {
    let mask;
    
    switch (filter.operator) {
      case 'eq':
        mask = df[filter.column].eq(filter.value);
        break;
      case 'gt':
        mask = df[filter.column].gt(filter.value);
        break;
      case 'lt':
        mask = df[filter.column].lt(filter.value);
        break;
      case 'contains':
        mask = df[filter.column].str.includes(filter.value);
        break;
      default:
        return [];
    }

    const filteredDf = df.loc({ rows: mask });
    return filteredDf['id'].values;
    
  } catch (error) {
    console.error('Error filtering DataFrame:', error);
    return [];
  }
}
