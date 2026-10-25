import type { ToastNotification } from "../types/domain";
import { createConfigReader } from "./yamlConfig";
import configText from "./ui.yaml?raw";

/* Typed copy of ui.yaml, parsed and validated once at module load. */
export function readUiConfig(text: string) {
  const reader = createConfigReader(text, "config/ui.yaml");
  const toast = reader.section(reader.root.toast, "toast");
  const duration = reader.section(toast.duration, "toast.duration");
  const durationOf = (type: ToastNotification["type"]) =>
    reader.integer(duration[type], `toast.duration.${type}`, 500);

  return {
    appName: reader.string(reader.root.appName, "appName"),
    toastDuration: {
      error: durationOf("error"),
      warning: durationOf("warning"),
      success: durationOf("success"),
      info: durationOf("info"),
    } satisfies Record<ToastNotification["type"], number>,
  };
}

export const uiConfig = readUiConfig(configText);
