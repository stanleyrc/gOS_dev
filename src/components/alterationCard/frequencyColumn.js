import { getEffectiveFrequency } from "../../helpers/interpretationHistory";

export default function createFrequencyColumn() {
  return {
    title: "Frequency",
    dataIndex: "frequency",
    key: "frequency",
    width: 100,
    minWidth: 100,
    render: (value, record) => getEffectiveFrequency(record),
    sorter: (a, b) => getEffectiveFrequency(a) - getEffectiveFrequency(b),
  };
}
