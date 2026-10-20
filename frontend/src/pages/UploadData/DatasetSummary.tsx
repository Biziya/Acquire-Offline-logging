import type { DatasetInfo } from "../../types/domain";
import {
  SECTION,
  SECTION_HEADING,
  SECTION_TEXT,
  SECTION_TITLE,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface DatasetSummaryProps {
  summary: DatasetInfo;
}

function DatasetSummary({ summary }: DatasetSummaryProps) {
  const summaryItems = [
    ["File Name", summary.fileName],
    ["Project", summary.project],
    ["Campaign", summary.campaign],
    ["Drillhole", summary.drillhole],
    ["Created By", summary.createdBy],
    ["Uploaded By", summary.uploadedBy],
    ["Total Records", summary.totalRecords],
    ["File Size", summary.fileSize],
    ["Validation Status", summary.validationStatus],
  ];

  return (
    <section className={SECTION} aria-labelledby="dataset-summary-title">
      <div className={SECTION_HEADING}>
        <span className={STEP_NUMBER}>2</span>
        <div>
          <h2 id="dataset-summary-title" className={SECTION_TITLE}>
            Dataset Information
          </h2>
          <p className={SECTION_TEXT}>
            Review the selected dataset details before import.
          </p>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-lg border border-[#e4e9f0] max-[680px]:grid-cols-1">
        {summaryItems.map(([label, value]) => (
          <div
            className="flex justify-between gap-4 border-b border-[#e4e9f0] px-[15px] py-[13px] odd:border-r last:border-b-0 last:odd:border-r-0 max-[680px]:border-r-0"
            key={label}
          >
            <dt className="text-[#667389]">{label}</dt>
            <dd className="m-0 text-right font-semibold [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default DatasetSummary;
