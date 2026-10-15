import React from "react";
import { Space, Typography } from "antd";
import { externalLinks } from "../../helpers/singleCell/externalLinks";

const { Link, Text } = Typography;

/** One row of out-links for a gene (and its protein change): cBioPortal GBM / pan-cancer, OncoKB, COSMIC. */
export default function ExternalLinksRow({ gene, protein = null, style }) {
  const links = externalLinks(gene, protein);
  if (!links.length) return null;
  return (
    <Space size={[10, 2]} wrap style={{ fontSize: 12, ...style }}>
      <Text type="secondary">{`${gene}:`}</Text>
      {links.map((l) => (
        <Link key={l.key} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</Link>
      ))}
    </Space>
  );
}
