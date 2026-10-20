import { useRef } from "react";

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
    <section
      className="upload-data-section"
      aria-labelledby="upload-file-title"
    >
      <div className="upload-data-section-heading">
        <span className="upload-data-step-number">1</span>
        <div>
          <h2 id="upload-file-title">File Selection</h2>
        </div>
      </div>

      <div className="upload-data-file-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          hidden
        />
        <span className="upload-data-upload-icon" aria-hidden="true">
          ⇧
        </span>
        <strong>Choose a completed JSON dataset</strong>
        <span>Supported format: JSON</span>
        <button
          className="upload-data-button upload-data-button-secondary"
          type="button"
          onClick={openFilePicker}
        >
          Upload JSON
        </button>
        {selectedFileName && (
          <span className="upload-data-selected-file">
            Selected: {selectedFileName}
          </span>
        )}
        {fileError && (
          <p className="upload-data-file-error" role="alert">
            {fileError}
          </p>
        )}
      </div>
    </section>
  );
}

export default UploadFileSection;
