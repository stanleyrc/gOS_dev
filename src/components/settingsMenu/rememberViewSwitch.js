import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Switch, Space, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { userAuthRepository } from "../../helpers/userAuth";
import { userSignInService } from "../../services/userSignInService";
import { currentUserId, savingEnabled, setSavingEnabled } from "../../helpers/singleCell/viewSettingsStore";

const { Text, Link } = Typography;

/** "Remember my view settings": off by default, enabled only when signed in (per-user storage). */
export default function RememberViewSwitch() {
  const dispatch = useDispatch();
  const palette = useSelector((state) => state.SingleCell.palette);
  const [userId, setUserId] = useState(currentUserId());
  const [on, setOn] = useState(savingEnabled());
  useEffect(() => {
    const changed = () => {
      // the signed-in user changed (sign-in, name update or sign-out): reload so the view matches that user's settings
      const next = currentUserId();
      if (next !== userId) window.location.reload();
    };
    userAuthRepository.emitter.on("userChanged", changed);
    return () => userAuthRepository.emitter.off("userChanged", changed);
  }, [userId]);
  const toggle = (checked) => {
    if (!setSavingEnabled(checked)) return;
    setOn(checked);
    setUserId(currentUserId());
    if (checked) {
      // save what is on screen now
      dispatch(singleCellActions.updateLayout({}));
      dispatch(singleCellActions.updatePalette(palette));
    }
  };
  return (
    <div>
      <Space size={8}>
        <Switch size="small" checked={Boolean(userId) && on} disabled={!userId} onChange={toggle} data-testid="remember-view-switch" />
        <Text strong>Remember my view settings</Text>
      </Space>
      <div>
        {userId ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Off by default. When on, your layout, filters, presets, sorting, palette, UMAP choices and column choices are saved in this browser under your username. Light/dark theme and cell-label mode are always remembered. Links (URL parameters) always override saved settings.
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Sign in (top bar, just a username) to save your view settings.{" "}
            <Link onClick={() => userSignInService.requestSignIn().catch(() => {})}>Sign in</Link>
            {" "}Without saving, every page load uses the shipped defaults. Light/dark theme and cell-label mode are still remembered.
          </Text>
        )}
      </div>
    </div>
  );
}
