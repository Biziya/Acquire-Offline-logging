import type { DatasetInfo } from "../../types/domain";
interface DatasetSummaryProps {
  summary: DatasetInfo;
}
function DatasetSummary({ summary }: DatasetSummaryProps) {
  const summaryItems = [
    ["File Name", summary.fileName],
    ["Project", summary.project],
    ["Campaign", summary.campaign],
    ["Drillhole", summary.drillhole],
  ];

  return (
    <section
      className="upload-data-section"
      aria-labelledby="dataset-summary-title"
    >
      <div className="upload-data-section-heading">
        <span className="upload-data-step-number">2</span>
        <div>
          <h2 id="dataset-summary-title">Dataset Summary</h2>
          <p>Review the selected dataset details before import.</p>
        </div>
      </div>

      <dl className="upload-data-summary">
        {summaryItems.map(([label, value]) => (
          <div className="upload-data-summary-item" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default DatasetSummary;
