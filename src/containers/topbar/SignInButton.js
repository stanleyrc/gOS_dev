import React, { Component } from "react";
import { Popover, Input, Button } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { withTranslation } from 'react-i18next';
import { getUser, setUser, createUser, userAuthRepository } from "../../helpers/userAuth";

class SignInButton extends Component {
  constructor(props) {
    super(props);
    const userData = getUser();
    this.state = {
      popoverVisible: false,
      displayName: userData?.displayName || '',
      inputValue: userData?.displayName || '',
      editing: false,
    };
  }

  componentDidMount() {
    this.handleUserChanged = (user) => {
      this.setState({
        displayName: user?.displayName || '',
        inputValue: user?.displayName || '',
      });
    };
    userAuthRepository.emitter.on('userChanged', this.handleUserChanged);
    // Sync with current user in case it changed after constructor
    this.handleUserChanged(getUser());
  }

  componentWillUnmount() {
    userAuthRepository.emitter.off('userChanged', this.handleUserChanged);
  }

  handlePopoverVisibleChange = (visible) => {
    this.setState({
      popoverVisible: visible,
      editing: visible ? this.state.editing : false,
      inputValue: visible ? this.state.inputValue : this.state.displayName,
    });
  };

  handleNameClick = () => {
    this.setState({ editing: true, inputValue: this.state.displayName });
  };

  handleInputBlur = (e) => {
    const newName = this.state.inputValue.trim();
    if (newName === '') {
      // Revert to old name if empty
      this.setState({ editing: false, popoverVisible: false, inputValue: this.state.displayName });
    } else {
      this.setState({ displayName: newName, editing: false, popoverVisible: false, inputValue: newName });
      const userData = getUser();
      if (userData) {
        userData.displayName = newName;
        setUser(userData);
      } else {
        createUser(newName);
      }
    }
  };

  render() {
    return (
      <Popover
        content={
          <div style={{ padding: '8px', minWidth: '270px' }}>
            {this.state.displayName && !this.state.editing ? (
              <span onClick={this.handleNameClick} style={{ cursor: 'pointer' }}>
                {this.state.displayName}
              </span>
            ) : (
              <Input
                value={this.state.inputValue}
                placeholder={this.props.t('components.signInButton.usernamePlaceholder')}
                onChange={(e) => this.setState({ inputValue: e.target.value })}
                onBlur={this.handleInputBlur}
                onPressEnter={this.handleInputBlur}
                autoFocus
              />
            )}
          </div>
        }
        trigger="click"
        placement="bottomLeft"
        open={this.state.popoverVisible}
        onOpenChange={this.handlePopoverVisibleChange}
      >
        <Button
          type="text"
          icon={<UserOutlined style={{ fontSize: '20px' }} />}
          style={{ border: 'none' }}
        />
      </Popover>
    );
  }
}

export default withTranslation("common")(SignInButton);
