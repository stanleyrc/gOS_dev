import React from "react";
import { Empty, Typography } from "antd";

const { Text } = Typography;

/** Placeholder for a panel whose precomputed input is missing. */
export default function NotComputed({ what, step, status }) {
  const failed = status === "error";
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <span>
          {failed ? `${what}: could not be loaded` : `${what}: not yet computed`}
          {step && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                precompute step <code>{step}</code> (gos_sc_precompute.py submit --steps {step})
              </Text>
            </>
          )}
        </span>
      }
    />
  );
}

/** status/data of one precompute file from the store. */
export const pcFile = (precompute, key) => {
  const f = precompute?.[key];
  return { ok: f?.status === "ok", status: f?.status || "missing", data: f?.status === "ok" ? f.data : null };
};
