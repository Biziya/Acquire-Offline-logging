import { useRef } from "react";
import {
  BUTTON_SECONDARY,
  SECTION,
  SECTION_HEADING,
  SECTION_TITLE,
  STEP_NUMBER,
} from "./uploadDataStyles";

interface UploadFileSectionProps {
  onFileSelect: (file: File) => void;
  fileError: string;
  selectedFileName: string;
}


function UploadFileSection({
  onFileSelect,
  fileError,
  selectedFileName,
}: UploadFileSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onFileSelect(file);
    }

    event.target.value = "";
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

      <div className="grid justify-items-center gap-2 rounded-[10px] border-2 border-dashed border-[#c7d2e3] bg-[#f8fafc] px-4 py-7 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          hidden
        />
        <span
          className="grid size-[42px] place-items-center rounded-full bg-[#eaf1ff] text-[1.5rem] font-bold text-[#2563eb]"
          aria-hidden="true"
        >
          ⇧
        </span>
        <strong>Choose a completed JSON dataset</strong>
        <span className="text-[0.86rem] text-[#738095]">
          Supported format: JSON
        </span>
        <button
          className={BUTTON_SECONDARY}
          type="button"
          onClick={openFilePicker}
        >
          Upload JSON
        </button>
        {selectedFileName && (
          <span className="font-semibold [overflow-wrap:anywhere] text-[#334155]">
            Selected: {selectedFileName}
          </span>
        )}
        {fileError && (
          <p className="mt-1 mb-0 text-[0.86rem] text-[#b42318]" role="alert">
            {fileError}
          </p>
        )}
      </div>
    </section>
  );
}

export default UploadFileSection;
