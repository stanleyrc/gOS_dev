import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Checkbox, Tooltip, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { hideNaFromSearch, withHideNa } from "../../helpers/singleCell/hideNa";

const { Text } = Typography;

/** [hideNa, setHideNa]: the one flag shared by every scatterplot (layout.hideNa, ?hidena=1). */
export default function useHideNa() {
  const dispatch = useDispatch();
  const hide = useSelector((s) => Boolean(s.SingleCell.layout?.hideNa));
  useEffect(() => {
    // a link with ?hidena=1 turns it on once
    try {
      const fromUrl = hideNaFromSearch(window.location.search);
      if (fromUrl != null && fromUrl !== hide) dispatch(singleCellActions.updateLayout({ hideNa: fromUrl }));
    } catch (error) {
      // no window
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (on) => {
    dispatch(singleCellActions.updateLayout({ hideNa: on }));
    try {
      const search = withHideNa(window.location.search, on);
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
    } catch (error) {
      // URL not writable: the flag still applies
    }
  };
  return [hide, set];
}

/** Checkbox plus a "hidden N NA cells" note, for a scatterplot's toolbar. */
export function HideNaControl({ hide, onChange, hidden = 0, noun = "cells" }) {
  const { t } = useTranslation("common");
  return (
    <>
      <Checkbox checked={hide} onChange={(e) => onChange(e.target.checked)}>
        <Tooltip title={t("components.single-cell.hide-na.help")}>{t("components.single-cell.hide-na.label")}</Tooltip>
      </Checkbox>
      {hide && <Text type="secondary" className="sc-hide-na-note">{t("components.single-cell.hide-na.note", { count: hidden, noun })}</Text>}
    </>
  );
}
