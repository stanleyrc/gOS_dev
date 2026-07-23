import React, { Component } from "react";
import PropTypes from "prop-types";
import { withTranslation } from "react-i18next";
import { Button, Popover, Space, Tooltip } from "antd";
import { DownOutlined, StarOutlined } from "@ant-design/icons";
import SavedQueryList from "../savedQueryList";
import Wrapper from "./index.style";

class SavedQueryButton extends Component {
  render() {
    const {
      t,
      currentSearchId,
      favoriteSearches,
      favoriteSearchesLoading,
      favoriteSearchesSaving,
      favoriteSearchDeletingId,
      loading,
      onApplyFavoriteSearch,
      onDeleteFavoriteSearch,
      onEditFavoriteSearch,
      onOpenFavoriteModal,
    } = this.props;

    return (
      <Wrapper>
        <Space size={4} className="favorite-query-controls">
          <Tooltip title={t("containers.list-view.favorites.save-tooltip")}>
            <Button
              className="save-favorite-query-button"
              type="text"
              size="small"
              icon={<StarOutlined />}
              disabled={!currentSearchId || loading || favoriteSearchesSaving}
              loading={favoriteSearchesSaving}
              onClick={onOpenFavoriteModal}
            />
          </Tooltip>
          <Popover
            placement="bottomRight"
            trigger="hover"
            overlayClassName="favorite-query-popover"
            content={
              <SavedQueryList
                favoriteSearches={favoriteSearches}
                favoriteSearchesLoading={favoriteSearchesLoading}
                favoriteSearchDeletingId={favoriteSearchDeletingId}
                onApplyFavoriteSearch={onApplyFavoriteSearch}
                onDeleteFavoriteSearch={onDeleteFavoriteSearch}
                onEditFavoriteSearch={onEditFavoriteSearch}
              />
            }
          >
            <Button
              className="favorite-query-menu-button"
              type="text"
              size="small"
              icon={<DownOutlined />}
              aria-label={t("containers.list-view.favorites.open-tooltip")}
            />
          </Popover>
        </Space>
      </Wrapper>
    );
  }
}

SavedQueryButton.propTypes = {
  currentSearchId: PropTypes.string,
  favoriteSearchDeletingId: PropTypes.string,
  favoriteSearches: PropTypes.arrayOf(PropTypes.object),
  favoriteSearchesLoading: PropTypes.bool,
  favoriteSearchesSaving: PropTypes.bool,
  loading: PropTypes.bool,
  onApplyFavoriteSearch: PropTypes.func.isRequired,
  onDeleteFavoriteSearch: PropTypes.func.isRequired,
  onEditFavoriteSearch: PropTypes.func.isRequired,
  onOpenFavoriteModal: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

SavedQueryButton.defaultProps = {
  currentSearchId: null,
  favoriteSearchDeletingId: null,
  favoriteSearches: [],
  favoriteSearchesLoading: false,
  favoriteSearchesSaving: false,
  loading: false,
};

export default withTranslation("common")(SavedQueryButton);