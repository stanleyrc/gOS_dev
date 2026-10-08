import React, { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined } from "@ant-design/icons";
import { getAppTheme, onAppThemeChange, setAppTheme } from "../../helpers/appTheme";

/** Floating light / dark switch (bottom-right). */
export default function ThemeToggle({ inline = false }) {
  const [theme, setTheme] = useState(getAppTheme());
  useEffect(() => onAppThemeChange(setTheme), []);
  const dark = theme === "dark";
  return (
    <Tooltip title={dark ? "Switch to light theme" : "Switch to dark theme"} placement="left">
      <Button
        shape="circle"
        size={inline ? "middle" : "large"}
        type={inline ? "text" : "default"}
        icon={dark ? <BulbFilled /> : <BulbOutlined />}
        onClick={() => setAppTheme(dark ? "light" : "dark")}
        style={inline ? { marginRight: 8 } : { position: "fixed", right: 18, bottom: 18, zIndex: 1000, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
      />
    </Tooltip>
  );
}
