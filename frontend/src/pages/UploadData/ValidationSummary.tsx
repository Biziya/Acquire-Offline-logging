import type { UploadValidation } from "./uploadDataValidation";
import { HELPER_TEXT, SECTION_TITLE } from "../../components/uiStyles";
import { FIELD_LABEL } from "../../components/fieldStyles";
import {
  SECTION,
  SECTION_HEADING,
  SECTION_HEADING_TEXT,
  STEP_NUMBER,
} from "./uploadDataStyles";
import { formatCount } from "../../utils/format";

interface ValidationSummaryProps {
  validation: UploadValidation | null;
}


const COUNTS = [
  ["total", "Total records", "text-rl-text"],
  ["valid", "Valid", "text-rl-success"],
  ["warning", "Warnings", "text-rl-warning"],
  ["error", "Invalid", "text-rl-danger"],
] as const;

function ValidationSummary({ validation }: ValidationSummaryProps) {
  const documentIssues = validation?.documentIssues ?? [];

  return (
    <section className={SECTION} aria-labelledby="validation-summary-title">
      <div className={SECTION_HEADING}>
        <span className={STEP_NUMBER}>4</span>
        <div className={SECTION_HEADING_TEXT}>
          <h2 id="validation-summary-title" className={SECTION_TITLE}>
            Validation summary
          </h2>
          <p className={HELPER_TEXT}>
            Records with errors can't be uploaded. Warnings are fine.
          </p>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-4 gap-2 max-[680px]:grid-cols-2">
        {COUNTS.map(([key, label, color]) => (
          <div
            key={key}
            className="rounded-ui border border-rl-grid bg-rl-navy-softer px-2.5 py-1.5"
          >
            <dt className={FIELD_LABEL}>{label}</dt>
            <dd className={`m-0 text-base font-bold ${color}`}>
              {validation ? formatCount(validation.counts[key]) : "—"}
            </dd>
          </div>
        ))}
      </dl>

      {documentIssues.length > 0 && (
        <ul className="mt-2 mb-0 grid list-none gap-1.5 p-0 text-[0.8125rem]">
          {documentIssues.map((issue) => (
            <li
              key={issue.message}
              className={
                issue.severity === "error"
                  ? "rounded-ui border border-rl-required-soft bg-rl-danger-soft px-2.5 py-1.5 text-rl-danger"
                  : "rounded-ui border border-rl-warning-border bg-rl-warning-soft px-2.5 py-1.5 text-rl-warning"
              }
            >
              <strong>{issue.severity === "error" ? "Error: " : "Warning: "}</strong>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ValidationSummary;
