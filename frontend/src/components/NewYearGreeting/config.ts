import { createConfigReader } from "../../config/yamlConfig";
import configText from "./config.yaml?raw";

/* Typed copy of config.yaml, parsed and validated once at module load. */
export function readGreetingConfig(text: string) {
  const reader = createConfigReader(text, "NewYearGreeting/config.yaml");
  const { root } = reader;

  function monthDay(value: unknown, path: string) {
    const text = reader.string(value, path);
    const match = /^(\d{2})-(\d{2})$/.exec(text);
    const month = Number(match?.[1]);
    const day = Number(match?.[2]);
    if (!match || month < 1 || month > 12 || day < 1 || day > 31)
      reader.fail(path, 'must be a month-day like "12-31".');
    return { month, day };
  }

  function bilingual(value: unknown, path: string) {
    const entry = reader.section(value, path);
    return {
      mn: reader.string(entry.mn, `${path}.mn`),
      en: reader.string(entry.en, `${path}.en`),
    };
  }

  return {
    start: monthDay(root.start, "start"),
    end: monthDay(root.end, "end"),
    title: bilingual(root.title, "title"),
    message: bilingual(root.message, "message"),
    signature: reader.string(root.signature, "signature"),
    button: reader.string(root.button, "button"),
  };
}

export type GreetingConfig = ReturnType<typeof readGreetingConfig>;
export type MonthDay = GreetingConfig["start"];

export const greetingConfig = readGreetingConfig(configText);
