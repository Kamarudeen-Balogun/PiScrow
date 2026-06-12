export type LanguageCode =
  | "en"
  | "es"
  | "fr"
  | "pt"
  | "ar"
  | "hi"
  | "id"
  | "zh"
  | "pcm";

export const supportedLanguages: {
  code: LanguageCode;
  label: string;
  shortLabel: string;
}[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "es", label: "Espanol", shortLabel: "ES" },
  { code: "fr", label: "Francais", shortLabel: "FR" },
  { code: "pt", label: "Portugues", shortLabel: "PT" },
  { code: "ar", label: "العربية", shortLabel: "AR" },
  { code: "hi", label: "हिन्दी", shortLabel: "HI" },
  { code: "id", label: "Bahasa Indonesia", shortLabel: "ID" },
  { code: "zh", label: "中文", shortLabel: "ZH" },
  { code: "pcm", label: "Naija Pidgin", shortLabel: "PCM" },
];
