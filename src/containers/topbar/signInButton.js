import React, { Component } from "react";
import { Button } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { withTranslation } from 'react-i18next';
import { getUser, userAuthRepository } from "../../helpers/userAuth";
import { userSignInService } from "../../services/userSignInService";

class SignInButton extends Component {
  constructor(props) {
    super(props);
    const userData = getUser();
    this.state = {
      displayName: userData?.displayName || '',
    };
  }

  componentDidMount() {
    this.handleUserChanged = (user) => {
      this.setState({
        displayName: user?.displayName || '',
      });
    };
    userAuthRepository.emitter.on('userChanged', this.handleUserChanged);
    // Sync with current user in case it changed after constructor
    this.handleUserChanged(getUser());
  }

  componentWillUnmount() {
    userAuthRepository.emitter.off('userChanged', this.handleUserChanged);
  }

  handleButtonClick = async () => {
    const currentUser = getUser();
    
    try {
      if (currentUser) {
        // User exists, request name update
        await userSignInService.requestNameUpdate(currentUser);
      } else {
        // No user, request sign-in
        await userSignInService.requestSignIn();
      }
    } catch (error) {
      // User cancelled or error occurred
      console.log('Sign-in cancelled or failed:', error);
    }
  };

  render() {
    const { displayName } = this.state;
    
    return (
      <Button
        type="text"
        icon={<UserOutlined style={{ fontSize: '20px' }} />}
        style={{ border: 'none' }}
        onClick={this.handleButtonClick}
        title={displayName || this.props.t('components.signInButton.signIn', 'Sign In')}
      />
    );
  }
}

export default withTranslation("common")(SignInButton);
