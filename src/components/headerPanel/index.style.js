import styled from "styled-components";

const Wrapper = styled.div`
  .site-page-header {
    background: white;
    padding: 16px 0px;
    margin: 0px 24px;
    .quality-report-link {
      font-weight: bold;
    }
    .site-page-content {
      margin-bottom: 24px;
    }
    .aligned-center {
      display: inline-flex;
      align-items: center;
    }
    .ant-pro-page-container-row {
      display: flex;
      width: 100%;
    }
    .ant-pro-page-container-content,
    .ant-pro-page-container-main .ant-pro-page-container-title {
      flex: auto;
      width: 100%;
    }
    .ant-page-header-content {
      padding-top: 6px;
    }
    .page-header-content {
      display: flex;
    }
    .page-header-content .avatar-content {
      flex: 0 1 72px;
    }
    .page-header-content .content-patient {
      position: relative;
      top: 4px;
      flex: 1 1 auto;
      margin-left: 24px;
      color: rgba(0, 0, 0, 0.45);
      line-height: 22px;
    }
    .page-header-content .avatar-content > span {
      display: block;
      width: 72px;
      height: 72px;
      border-radius: 72px;
      border: 1px solid #013159;
      background: rgba(193, 173, 148, 0.33);
    }
    .ant-avatar > img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .page-header-content .content-patient .content-patient-title {
      margin-bottom: 12px;
      color: rgba(0, 0, 0, 0.85);
      font-weight: 500;
      font-size: 20px;
      line-height: 28px;
    }
    .ant-pro-page-container-main .ant-pro-page-container-extraContent {
      min-width: 242px;
      margin-left: 88px;
      text-align: right;
    }
    .extra-content {
      zoom: 1;
      float: right;
      white-space: nowrap;
    }
    .extra-content .stat-item {
      position: relative;
      display: inline-block;
      padding: 0 32px;
    }
    .extra-content .stat-item:after {
      position: absolute;
      top: 8px;
      right: 0;
      width: 1px;
      height: 40px;
      background-color: #f0f0f0;
      content: "";
    }
    .purity-ploidy-separator {
      color: rgba(0, 0, 0, 0.45);
    }
    .ant-statistic-content {
      font-size: 24px;
      line-height: 1.5715;
    }

    .ant-statistic-title,
    .ant-statistic-content-value-int,
    .ant-statistic-content-suffix {
      cursor: default;
      color: #00000073;
      margin-bottom: 4px;
    }
    .has-tooltip {
      text-decoration: underline dashed;
      text-underline-position: under;
      text-decoration-color: #d2d2d2;
    }
    div.ant-popover-title > div > a {
      text-align: right;
      float: right;
    }
    .tag-header {
      font-size: 14px;
      font-family: Roboto, sans-serif;
    }
    .tags-container {
      max-width: 60%;
    }
  }
`;

export default Wrapper;
