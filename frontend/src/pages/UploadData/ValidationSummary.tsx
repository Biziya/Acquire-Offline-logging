import type { UploadValidation } from "./uploadDataValidation";
import {
  SECTION,
  SECTION_HEADING,
  SECTION_TEXT,
  SECTION_TITLE,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface ValidationSummaryProps {
  validation: UploadValidation | null;
}

const numberFormat = new Intl.NumberFormat("en-US");

const COUNTS = [
  ["total", "Total records", "text-rl-text"],
  ["valid", "Valid", "text-[#1e7a54]"],
  ["warning", "Warnings", "text-[#b7791f]"],
  ["error", "Invalid", "text-rl-danger"],
] as const;

function ValidationSummary({ validation }: ValidationSummaryProps) {
  const documentIssues = validation?.documentIssues ?? [];

  return (
    <section className={SECTION} aria-labelledby="validation-summary-title">
      <div className={SECTION_HEADING}>
        <span className={STEP_NUMBER}>4</span>
        <div>
          <h2 id="validation-summary-title" className={SECTION_TITLE}>
            Validation Summary
          </h2>
          <p className={SECTION_TEXT}>
            Invalid records block the import. Warnings are allowed.
          </p>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-4 gap-3 max-[680px]:grid-cols-2">
        {COUNTS.map(([key, label, color]) => (
          <div
            key={key}
            className="rounded-lg border border-[#e4e9f0] px-[15px] py-3"
          >
            <dt className="text-[0.85rem] text-[#667389]">{label}</dt>
            <dd className={`m-0 text-[1.35rem] font-bold ${color}`}>
              {validation ? numberFormat.format(validation.counts[key]) : "—"}
            </dd>
          </div>
        ))}
      </dl>

      {documentIssues.length > 0 && (
        <ul className="mt-3.5 mb-0 grid list-none gap-1.5 p-0 text-[0.86rem]">
          {documentIssues.map((issue) => (
            <li
              key={issue.message}
              className={
                issue.severity === "error"
                  ? "rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[#b42318]"
                  : "rounded-md border border-[#f3d18b] bg-[#fffbeb] px-3 py-2 text-[#8a5a00]"
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
