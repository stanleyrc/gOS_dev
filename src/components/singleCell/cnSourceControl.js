import React from "react";
import { useDispatch } from "react-redux";
import { Segmented, Space, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import { cnSourceNote, cnSourceOptions } from "../../helpers/singleCell/cnSource";

const { Text } = Typography;

/**
 * "Copy number: Regular | Joint junction balance" (shown only when the patient has an sc_cn_joint/ export).
 * The tooltip lists the predefined verdict criteria and which the joint view passed.
 */
export default function CnSourceControl({ cnSource, cnSourceRequested, cnJoint }) {
  const dispatch = useDispatch();
  const manifest = cnJoint?.manifest;
  const options = cnSourceOptions(manifest);
  if (!options.length) return null;
  const loading = cnSourceRequested === "joint" && cnSource !== "joint" && cnJoint.status === "loading";
  const failed = cnSourceRequested === "joint" && cnJoint.status === "error";
  const tip = (
    <div style={{ maxWidth: 380 }}>
      <div>{cnSourceNote(manifest)}</div>
      {manifest.criteria.length > 0 && (
        <ul style={{ paddingLeft: 16, margin: "6px 0 0" }}>
          {manifest.criteria.map((c) => (
            <li key={c.key}>
              {c.pass ? "pass" : "fail"}: {c.label}
              {c.detail ? ` (${c.detail})` : ""}
            </li>
          ))}
        </ul>
      )}
      {manifest.cellsMissing.length > 0 && <div style={{ marginTop: 6 }}>Not available for {manifest.cellsMissing.length} cell(s): {manifest.cellsMissing.slice(0, 3).map((m) => `${m.cell} (${m.reason})`).join(", ")}</div>}
    </div>
  );
  return (
    <Space size={4} data-testid="cn-source-control">
      <Text type="secondary">Copy number</Text>
      <Segmented
        size="small"
        options={options}
        value={cnSourceRequested === "joint" ? "joint" : "regular"}
        onChange={(value) => dispatch(singleCellActions.updateCnSource(value))}
      />
      <Tooltip title={tip}>
        <InfoCircleOutlined />
      </Tooltip>
      {loading && <Text type="secondary">loading joint…</Text>}
      {failed && <Text type="danger">joint not available ({cnJoint.error?.message || "files could not be read"})</Text>}
    </Space>
  );
}
