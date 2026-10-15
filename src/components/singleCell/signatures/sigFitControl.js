import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Checkbox, Segmented, Space, Tooltip } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { FIT_JOINT, FIT_LEGACY, candidateSignatures, sigFitMode } from "../../../helpers/singleCell/signatureJoint";

/**
 * The signature fit shared by the Signatures tab, the mutation-matrix Signature track and Isolate
 * (layout.sigFit / layout.sigCandidates, URL sigfit / sigcand): joint (patient set) or independent (legacy),
 * and, for the joint fit, whether below-threshold candidate signatures take part in the per-site assignment.
 */
export default function SigFitControl({ size = "small" }) {
  const dispatch = useDispatch();
  const { signaturesJoint, layout } = useSelector((s) => s.SingleCell);
  const joint = signaturesJoint?.status === "ok" ? signaturesJoint.data : null;
  if (!joint) return null;
  const mode = sigFitMode(layout, true);
  const nCand = candidateSignatures(joint).length;
  return (
    <Space size={8} wrap>
      <Tooltip title="Joint: every site set is refit on one signature set chosen for the patient. Independent (legacy): each set fit alone against all of COSMIC. Shared by the Signatures tab, the Signature track and Isolate.">
        <Segmented
          size={size}
          value={mode}
          onChange={(v) => dispatch(singleCellActions.updateLayout({ sigFit: v }))}
          options={[{ value: FIT_JOINT, label: "Fit: joint (patient set)" }, { value: FIT_LEGACY, label: "independent (legacy)" }]}
        />
      </Tooltip>
      {mode === FIT_JOINT && nCand > 0 && (
        <Tooltip title="Below-threshold candidate signatures (they pass the likelihood-ratio test but not the exposure / cosine / bootstrap thresholds, e.g. SBS13 in MGH305 subclonal) join the per-site assignment.">
          <Checkbox checked={Boolean(layout.sigCandidates)} onChange={(e) => dispatch(singleCellActions.updateLayout({ sigCandidates: e.target.checked }))}>
            include candidates ({nCand})
          </Checkbox>
        </Tooltip>
      )}
    </Space>
  );
}
