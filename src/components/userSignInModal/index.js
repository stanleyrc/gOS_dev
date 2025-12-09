import React, { Component } from "react";
import { connect } from "react-redux";
import { Modal, Input, message } from "antd";
import { withTranslation } from 'react-i18next';
import { userSignInService } from "../../services/userSignInService";
import { getUser, setUser, createUser } from "../../helpers/userAuth";
import { getAllAuthorNames, isUsernameAvailable } from "../../helpers/userAuthValidation";
import interpretationsActions from "../../redux/interpretations/actions";

class UserSignInModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      visible: false,
      inputValue: '',
      mode: 'create', // 'create' or 'update'
      currentUser: null,
      validationError: '',
    };
  }

  componentDidMount() {
    this.handleSignInRequested = ({ mode, currentUser }) => {
      this.setState({
        visible: true,
        mode: mode || 'create',
        currentUser: currentUser || null,
        inputValue: currentUser?.displayName || '',
        validationError: '',
      });
    };
    
    userSignInService.on('signInRequested', this.handleSignInRequested);
  }

  componentWillUnmount() {
    userSignInService.off('signInRequested', this.handleSignInRequested);
  }

  handleInputChange = (e) => {
    this.setState({ 
      inputValue: e.target.value,
      validationError: '' // Clear error on input
    });
  };

  validateAndSubmit = () => {
    const { inputValue, currentUser } = this.state;
    const { interpretationsById, dispatch } = this.props;
    
    const trimmedName = inputValue.trim();
    
    // Get all existing author names
    const existingAuthorNames = getAllAuthorNames(interpretationsById);
    
    // Check if username is available
    const validation = isUsernameAvailable(
      trimmedName, 
      existingAuthorNames, 
      currentUser?.displayName
    );
    
    if (!validation.isAvailable) {
      this.setState({ validationError: validation.message });
      message.error(validation.message);
      return;
    }
    
    // Create or update user
    let user;
    const existingUser = getUser();
    
    if (existingUser) {
      // Update existing user
      const oldDisplayName = existingUser.displayName;
      existingUser.displayName = trimmedName;
      setUser(existingUser);
      user = existingUser;
      
      // If name actually changed, dispatch bulk update action
      if (oldDisplayName !== trimmedName) {
        dispatch(interpretationsActions.updateAuthorName(existingUser.userId, trimmedName));
      }
    } else {
      // Create new user
      user = createUser(trimmedName);
    }
    
    // Close modal and resolve promise
    this.setState({
      visible: false,
      inputValue: '',
      validationError: '',
      currentUser: null,
    });
    
    userSignInService.resolveSignIn(user);
  };

  handleCancel = () => {
    this.setState({
      visible: false,
      inputValue: '',
      validationError: '',
      currentUser: null,
    });
    
    userSignInService.cancelSignIn();
  };

  render() {
    const { t } = this.props;
    const { visible, inputValue, mode, validationError } = this.state;
    
    const title = mode === 'update' 
      ? t('components.signInButton.updateUsername', 'Update Username')
      : t('components.signInButton.enterUsername', 'Enter Username');
    
    return (
      <Modal
        title={title}
        open={visible}
        onOk={this.validateAndSubmit}
        onCancel={this.handleCancel}
        okText={t('general.submit', 'Submit')}
        cancelText={t('general.cancel', 'Cancel')}
        destroyOnClose
      >
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <Input
            value={inputValue}
            placeholder={t('components.signInButton.usernamePlaceholder', 'Enter your display name')}
            onChange={this.handleInputChange}
            onPressEnter={this.validateAndSubmit}
            status={validationError ? 'error' : ''}
            autoFocus
          />
          {validationError && (
            <div style={{ color: '#ff4d4f', marginTop: 8, fontSize: 12 }}>
              {validationError}
            </div>
          )}
        </div>
      </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  interpretationsById: state.Interpretations?.byId || {},
});

export default connect(mapStateToProps)(withTranslation("common")(UserSignInModal));
