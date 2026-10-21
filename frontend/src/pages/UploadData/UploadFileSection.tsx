import { useEffect, useRef, useState } from "react";
import {
  BUTTON_SECONDARY,
  SECTION,
  SECTION_HEADING,
  SECTION_TITLE,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface UploadFileSectionProps {
  onFileSelect: (file: File) => void;
  onFileReject: (message: string) => void;
  /* Name of the successfully loaded file; empty before one is loaded. */
  selectedFileName: string;
  recordCount: number;
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
        <div>
          <h2 id="upload-file-title" className={SECTION_TITLE}>
            File Selection
          </h2>
        </div>
      </div>

      <div
        className={`grid justify-items-center gap-2 rounded-[10px] border-2 px-4 py-7 text-center transition-colors duration-140 ${
          isDragging
            ? "upload-drop-zone--active border-dashed border-[#2563eb] bg-[#eff6ff]"
            : isLoaded
              ? "upload-drop-zone--loaded border-solid border-[#86efac] bg-[#f0fdf4]"
              : "border-dashed border-[#c7d2e3] bg-[#f8fafc]"
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
              className="grid size-[42px] place-items-center rounded-full bg-[#dcfce7] text-[1.4rem] font-bold text-[#15803d]"
              aria-hidden="true"
            >
              ✓
            </span>
            <strong className="text-[#166534]" role="status">
              JSON File Loaded
            </strong>
            <span className="max-w-full font-semibold [overflow-wrap:anywhere] text-[#334155]">
              {selectedFileName}
            </span>
            <span className="text-[0.86rem] text-[#4b5563]">
              {recordFormat.format(recordCount)}{" "}
              {recordCount === 1 ? "record" : "records"}
            </span>
            <button
              className={BUTTON_SECONDARY}
              type="button"
              onClick={openFilePicker}
            >
              Change File
            </button>
          </>
        ) : (
          <>
            <span
              className="grid size-[42px] place-items-center rounded-full bg-[#eaf1ff] text-[1.5rem] font-bold text-[#2563eb]"
              aria-hidden="true"
            >
              ⇧
            </span>
            <strong>
              {isDragging ? "Drop the JSON file here" : "Drag and drop your JSON file"}
            </strong>
            <span className="text-[0.86rem] text-[#738095]">or</span>
            <button
              className={BUTTON_SECONDARY}
              type="button"
              onClick={openFilePicker}
            >
              Browse Files
            </button>
            <span className="text-[0.86rem] text-[#738095]">
              Supported format: .json
            </span>
          </>
        )}
      </div>
    </section>
  );
}

export default UploadFileSection;
