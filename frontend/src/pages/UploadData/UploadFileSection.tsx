import { useEffect, useRef, useState } from "react";
import { HELPER_TEXT, SECONDARY_BUTTON, SECTION_TITLE } from "../../components/uiStyles";
import {
  ICON_BUTTON,
  SECTION,
  SECTION_HEADING,
  SECTION_HEADING_TEXT,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface UploadFileSectionProps {
  onFileSelect: (file: File) => void;
  onFileReject: (message: string) => void;
  /* Name of the successfully loaded file; empty before one is loaded. */
  selectedFileName: string;
  recordCount: number;
  /* Clears the loaded file and everything built from it. */
  onFileRemove: () => void;
  /* True while an upload is running: the file cannot be removed then. */
  isRemoveDisabled: boolean;
}

const recordFormat = new Intl.NumberFormat("en-US");

function hasFiles(event: DragEvent | React.DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/*
 * 1. File Selection. Browse Files and a drop onto the zone both hand the file
 * to `onFileSelect` (UploadData's handleFileSelect), which owns the type check,
 * parsing and validation. Nothing is uploaded until Import Data is confirmed.
 */
function UploadFileSection({
  onFileSelect,
  onFileReject,
  selectedFileName,
  recordCount,
  onFileRemove,
  isRemoveDisabled,
}: UploadFileSectionProps) {
  // A file only reaches `selectedFileName` once it has parsed successfully.
  const isLoaded = Boolean(selectedFileName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // A file dropped beside the zone must not make the browser open it and
  // discard the page (and any edits).
  useEffect(() => {
    function blockFileDrop(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault();
    }

    window.addEventListener("dragover", blockFileDrop);
    window.addEventListener("drop", blockFileDrop);
    return () => {
      window.removeEventListener("dragover", blockFileDrop);
      window.removeEventListener("drop", blockFileDrop);
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onFileSelect(file);
    }

    // Lets the same file be chosen again.
    event.target.value = "";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // Moving over a child of the zone is not leaving it.
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files);
    const [file] = files;

    if (!file) return;
    if (files.length > 1) {
      onFileReject("Drop one file at a time");
      return;
    }

    onFileSelect(file);
  };

  return (
    <section className={SECTION} aria-labelledby="upload-file-title">
      <div className={SECTION_HEADING}>
        <span className={STEP_NUMBER}>1</span>
        <div className={SECTION_HEADING_TEXT}>
          <h2 id="upload-file-title" className={SECTION_TITLE}>
            File Selection
          </h2>
        </div>
      </div>

      <div
        className={`grid justify-items-center gap-1.5 rounded-ui border-2 px-4 py-5 text-center text-[0.85rem] text-rl-text transition-colors duration-140 ${
          isDragging
            ? "upload-drop-zone--active border-dashed border-rl-navy bg-rl-navy-soft"
            : isLoaded
              ? "upload-drop-zone--loaded border-solid border-rl-border bg-rl-navy-softer"
              : "border-dashed border-rl-border-strong bg-rl-navy-softer"
        }`}
        data-testid="upload-drop-zone"
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          hidden
        />
        {isLoaded && !isDragging ? (
          // Loaded: confirm the file. Dropping another file still replaces it.
          <>
            <span
              className="grid size-9 place-items-center rounded-full bg-rl-success-soft text-[1.2rem] font-bold text-rl-success"
              aria-hidden="true"
            >
              ✓
            </span>
            <strong className="font-semibold text-rl-success" role="status">
              JSON File Loaded
            </strong>
            <span className="flex max-w-full items-center gap-2">
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere] text-rl-text">
                {selectedFileName}
              </span>
              <button
                className={ICON_BUTTON}
                type="button"
                aria-label="Remove selected file"
                title={isRemoveDisabled ? "Wait for the upload to finish" : "Remove selected file"}
                disabled={isRemoveDisabled}
                onClick={onFileRemove}
              >
                ×
              </button>
            </span>
            <span className={HELPER_TEXT}>
              {recordFormat.format(recordCount)}{" "}
              {recordCount === 1 ? "record" : "records"}
            </span>
            <button
              className={SECONDARY_BUTTON}
              type="button"
              onClick={openFilePicker}
            >
              Change File
            </button>
          </>
        ) : (
          <>
            <span
              className="grid size-9 place-items-center rounded-full bg-rl-navy-soft text-[1.3rem] font-bold text-rl-navy"
              aria-hidden="true"
            >
              ⇧
            </span>
            <strong className="font-semibold">
              {isDragging ? "Drop the JSON file here" : "Drag and drop your JSON file"}
            </strong>
            <span className={HELPER_TEXT}>or</span>
            <button
              className={SECONDARY_BUTTON}
              type="button"
              onClick={openFilePicker}
            >
              Browse Files
            </button>
            <span className={HELPER_TEXT}>
              Supported format: .json
            </span>
          </>
        )}
      </div>
    </section>
  );
}

export default UploadFileSection;
