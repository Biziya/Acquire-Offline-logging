import type { DatasetInfo } from "../../types/domain";
import { SECTION_TITLE } from "../../components/uiStyles";
import {
  SECTION,
  SECTION_HEADING,
  SECTION_HEADING_TEXT,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface DatasetSummaryProps {
  summary: DatasetInfo;
}

function DatasetSummary({ summary }: DatasetSummaryProps) {
  const summaryItems = [
    ["File name", summary.fileName],
    ["Project", summary.project],
    ["Campaign", summary.campaign],
    ["Drillhole", summary.drillhole],
    ["Created by", summary.createdBy],
    ["Edited by", summary.editedBy],
    ["Imported by", summary.importedBy],
    ["Total records", summary.totalRecords],
    ["File size", summary.fileSize],
    ["Validation status", summary.validationStatus],
  ];

  return (
    <section className={SECTION} aria-labelledby="dataset-summary-title">
      <div className={SECTION_HEADING}>
        <span className={STEP_NUMBER}>2</span>
        <div className={SECTION_HEADING_TEXT}>
          <h2 id="dataset-summary-title" className={SECTION_TITLE}>
            Dataset
          </h2>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-ui border border-rl-grid text-[0.8125rem] max-[680px]:grid-cols-1">
        {summaryItems.map(([label, value]) => (
          <div
            className="flex justify-between gap-4 border-b border-rl-grid px-2.5 py-1.5 odd:border-r last:border-b-0 last:odd:border-r-0 max-[680px]:border-r-0"
            key={label}
          >
            <dt className="text-rl-text-muted">{label}</dt>
            <dd className="m-0 text-right font-semibold text-rl-text [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default DatasetSummary;
