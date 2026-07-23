import React, { Component } from "react";
import PropTypes from "prop-types";
import { withTranslation } from "react-i18next";
import { Button, Empty, Spin, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { buildSavedSearchDescriptionParts } from "../../helpers/savedSearches";
import Wrapper, { SavedQueryListPopoverStyle } from "./index.style";

const { Text } = Typography;

class SavedQueryList extends Component {
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

  renderFavoriteSearchMenuItem = (favoriteSearch) => {
    const {
      t,
      favoriteSearchDeletingId,
      onApplyFavoriteSearch,
      onDeleteFavoriteSearch,
      onEditFavoriteSearch,
    } = this.props;
    const isDeleting = favoriteSearchDeletingId === favoriteSearch.id;

    return (
      <div key={favoriteSearch.id} className="favorite-query-menu-item">
        <Button
          className="favorite-query-apply-button"
          type="text"
          onClick={() => onApplyFavoriteSearch(favoriteSearch.id)}
          disabled={isDeleting}
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
        </Button>
        <div className="favorite-query-menu-actions">
          <Tooltip title={t("containers.list-view.favorites.edit-tooltip")}>
            <Button
              className="favorite-query-edit-button"
              type="text"
              size="small"
              icon={<EditOutlined />}
              disabled={isDeleting}
              onClick={(event) => onEditFavoriteSearch(event, favoriteSearch)}
            />
          </Tooltip>
          <Tooltip title={t("containers.list-view.favorites.delete-tooltip")}>
            <Button
              className="favorite-query-delete-button"
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              loading={isDeleting}
              disabled={isDeleting}
              onClick={(event) =>
                onDeleteFavoriteSearch(event, favoriteSearch.id)
              }
            />
          </Tooltip>
        </div>
      </div>
    );
  };

  renderContent = () => {
    const { t, favoriteSearches, favoriteSearchesLoading } = this.props;

    if (favoriteSearchesLoading) {
      return (
        <div className="favorite-query-menu-content favorite-query-menu-state">
          <Spin size="small" />
        </div>
      );
    }

    if (favoriteSearches.length === 0) {
      return (
        <div className="favorite-query-menu-content favorite-query-menu-state">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("containers.list-view.favorites.empty")}
          />
        </div>
      );
    }

    return (
      <div className="favorite-query-menu-content">
        <Text type="secondary" className="favorite-query-menu-title">
          {t("containers.list-view.favorites.menu-title")}
        </Text>
        {favoriteSearches.map((favoriteSearch) =>
          this.renderFavoriteSearchMenuItem(favoriteSearch),
        )}
      </div>
    );
  };

  render() {
    return (
      <>
        <SavedQueryListPopoverStyle />
        <Wrapper>{this.renderContent()}</Wrapper>
      </>
    );
  }
}

SavedQueryList.propTypes = {
  favoriteSearchDeletingId: PropTypes.string,
  favoriteSearches: PropTypes.arrayOf(PropTypes.object),
  favoriteSearchesLoading: PropTypes.bool,
  onApplyFavoriteSearch: PropTypes.func.isRequired,
  onDeleteFavoriteSearch: PropTypes.func.isRequired,
  onEditFavoriteSearch: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

SavedQueryList.defaultProps = {
  favoriteSearchDeletingId: null,
  favoriteSearches: [],
  favoriteSearchesLoading: false,
};

export default withTranslation("common")(SavedQueryList);