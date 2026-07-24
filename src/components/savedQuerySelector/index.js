import React, { Component } from "react";
import PropTypes from "prop-types";
import { withTranslation } from "react-i18next";
import { Select, Tooltip, Typography } from "antd";
import { buildSavedSearchDescriptionParts } from "../../helpers/savedSearches";
import Wrapper, { SavedQuerySelectorDropdownStyle } from "./index.style";

const { Option } = Select;
const { Text } = Typography;

class SavedQuerySelector extends Component {
  getFavoriteDescriptionParts = (favoriteSearch = {}) =>
    buildSavedSearchDescriptionParts({
      description: favoriteSearch?.description,
      resultCount: favoriteSearch?.resultCount,
      t: this.props.t,
    });

  renderFavoriteCount = (favoriteSearch) => {
    const { countLabel, countNounText } =
      this.getFavoriteDescriptionParts(favoriteSearch);

    if (!countLabel) {
      return null;
    }

    return (
      <span className="favorite-query-option-count">
        <strong>{countLabel}</strong>
        {countNounText ? ` ${countNounText}` : null}
      </span>
    );
  };

  renderFavoriteDescription = (favoriteSearch) => {
    const { bodyText, fullText } =
      this.getFavoriteDescriptionParts(favoriteSearch);

    if (!bodyText) {
      return null;
    }

    return (
      <Tooltip title={fullText} placement="right">
        <span className="favorite-query-option-description-wrap">
          <Text type="secondary" className="favorite-query-option-description">
            {bodyText}
          </Text>
        </span>
      </Tooltip>
    );
  };

  renderFavoriteOption = (favoriteSearch) => (
    <Option
      key={favoriteSearch.id}
      value={favoriteSearch.id}
      label={favoriteSearch.name}
    >
      <div className="favorite-query-option">
        <div className="favorite-query-option-header">
          <Text
            strong
            className="favorite-query-option-title"
            ellipsis={{ tooltip: favoriteSearch.name }}
          >
            {favoriteSearch.name}
          </Text>
          {this.renderFavoriteCount(favoriteSearch)}
        </div>
        {this.renderFavoriteDescription(favoriteSearch)}
      </div>
    </Option>
  );

  render() {
    const { t, favoriteSearches, selectedFavoriteIds, onChange } = this.props;

    return (
      <>
        <SavedQuerySelectorDropdownStyle />
        <Wrapper>
          <Select
            mode="multiple"
            allowClear
            className="cohort-comparison-select"
            popupClassName="cohort-comparison-dropdown"
            value={selectedFavoriteIds}
            disabled={favoriteSearches.length === 0}
            placeholder={t("containers.list-view.cohorts.compare-placeholder")}
            optionLabelProp="label"
            optionFilterProp="label"
            showSearch
            onChange={onChange}
            notFoundContent={t("containers.list-view.favorites.empty")}
          >
            {favoriteSearches
              .filter((favoriteSearch) => favoriteSearch.searchId)
              .map((favoriteSearch) => this.renderFavoriteOption(favoriteSearch))}
          </Select>
        </Wrapper>
      </>
    );
  }
}

SavedQuerySelector.propTypes = {
  favoriteSearches: PropTypes.arrayOf(PropTypes.object),
  onChange: PropTypes.func.isRequired,
  selectedFavoriteIds: PropTypes.arrayOf(PropTypes.string),
  t: PropTypes.func.isRequired,
};

SavedQuerySelector.defaultProps = {
  favoriteSearches: [],
  selectedFavoriteIds: [],
};

export default withTranslation("common")(SavedQuerySelector);