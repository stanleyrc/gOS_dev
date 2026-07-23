import React, { Component } from "react";
import PropTypes from "prop-types";
import { withTranslation } from "react-i18next";
import { Input, Modal, Space, Typography } from "antd";
import { buildSavedSearchDescriptionParts } from "../../helpers/savedSearches";
import Wrapper, { SavedQueryEditModalStyle } from "./index.style";

const { Paragraph } = Typography;

class SavedQueryEditModal extends Component {
  getFavoriteDescriptionParts = () =>
    buildSavedSearchDescriptionParts({
      description: this.props.description,
      resultCount: this.props.resultCount,
      t: this.props.t,
    });

  renderDescription = () => {
    const { bodyText, countLabel, countNounText } =
      this.getFavoriteDescriptionParts();

    if (!bodyText && !countLabel) {
      return null;
    }

    return (
      <>
        {countLabel && <strong>{countLabel}</strong>}
        {countLabel && countNounText ? ` ${countNounText}` : null}
        {countLabel && bodyText ? " " : null}
        {bodyText}
      </>
    );
  };

  render() {
    const {
      t,
      description,
      favoriteName,
      favoriteSearchesSaving,
      isEditing,
      onCancel,
      onFavoriteNameChange,
      onSave,
      open,
    } = this.props;

    return (
      <>
        <SavedQueryEditModalStyle />
        <Wrapper>
          <Modal
            title={t(
              isEditing
                ? "containers.list-view.favorites.edit-modal-title"
                : "containers.list-view.favorites.modal-title",
            )}
            open={open}
            confirmLoading={favoriteSearchesSaving}
            okButtonProps={{ disabled: !favoriteName.trim() }}
            onOk={onSave}
            onCancel={onCancel}
            destroyOnHidden
            wrapClassName="saved-query-edit-modal"
          >
            <Space direction="vertical" size="middle" style={{ display: "flex" }}>
              <Input
                autoFocus
                value={favoriteName}
                placeholder={t("containers.list-view.favorites.name-placeholder")}
                onChange={(event) => onFavoriteNameChange(event.target.value)}
              />
              <Paragraph type="secondary" className="favorite-query-description">
                {description ? this.renderDescription() : null}
              </Paragraph>
            </Space>
          </Modal>
        </Wrapper>
      </>
    );
  }
}

SavedQueryEditModal.propTypes = {
  description: PropTypes.string,
  favoriteName: PropTypes.string,
  favoriteSearchesSaving: PropTypes.bool,
  isEditing: PropTypes.bool,
  onCancel: PropTypes.func.isRequired,
  onFavoriteNameChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  open: PropTypes.bool,
  resultCount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  t: PropTypes.func.isRequired,
};

SavedQueryEditModal.defaultProps = {
  description: "",
  favoriteName: "",
  favoriteSearchesSaving: false,
  isEditing: false,
  open: false,
  resultCount: null,
};

export default withTranslation("common")(SavedQueryEditModal);