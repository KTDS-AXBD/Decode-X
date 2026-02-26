import type { UnstructuredElement } from "./unstructured.js";

export type DocumentCategory =
  | "erd"
  | "screen_design"
  | "api_spec"
  | "requirements"
  | "process"
  | "general";

export type DocumentClassification = {
  category: DocumentCategory;
  confidence: number;
};

const KEYWORD_RULES: Array<{ keywords: string[]; category: DocumentCategory }> = [
  { keywords: ["ERD", "엔터티", "entity", "관계"], category: "erd" },
  { keywords: ["화면", "UI", "UX", "스크린"], category: "screen_design" },
  { keywords: ["API", "endpoint", "swagger"], category: "api_spec" },
  { keywords: ["요구사항", "requirement", "기능"], category: "requirements" },
  { keywords: ["프로세스", "절차", "업무"], category: "process" },
];

export function classifyDocument(
  elements: UnstructuredElement[],
  _fileType: string,
): DocumentClassification {
  const combinedText = elements.map((el) => el.text).join(" ");

  for (const { keywords, category } of KEYWORD_RULES) {
    const matched = keywords.some((kw) => combinedText.includes(kw));
    if (matched) {
      return { category, confidence: 0.9 };
    }
  }

  return { category: "general", confidence: 0.5 };
}
