import type { PiiEntityType } from "@ai-foundry/types";

export interface PiiPattern {
  entityType: PiiEntityType;
  /** Global regex — must use `g` flag */
  regex: RegExp;
}

/**
 * Ordered list of PII patterns for the 퇴직연금 domain.
 * More specific patterns (SSN, CORP_ID) must come before generic ones (ACCOUNT).
 */
export const PII_PATTERNS: PiiPattern[] = [
  {
    // 주민등록번호: 6자리-1~4로 시작하는 7자리 (e.g. 901231-1234567)
    entityType: "PII_SSN",
    regex: /\d{6}-[1-4]\d{6}/g,
  },
  {
    // 법인등록번호: 6자리-7자리 (주민번호와 구분: 첫자리 5~9)
    entityType: "PII_CORP_ID",
    regex: /\d{6}-[5-9]\d{6}/g,
  },
  {
    // 카드번호: 4-4-4-4 형식
    entityType: "PII_CARD",
    regex: /\d{4}-\d{4}-\d{4}-\d{4}/g,
  },
  {
    // 전화번호: 02-xxxx-xxxx | 0xx-xxx-xxxx | 0xx-xxxx-xxxx
    entityType: "PII_PHONE",
    regex: /0\d{1,2}-\d{3,4}-\d{4}/g,
  },
  {
    // 이메일
    entityType: "PII_EMAIL",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    // 계좌번호: 3~6자리-2~6자리-4~6자리 (카드, 주민번호 이후 적용)
    entityType: "PII_ACCOUNT",
    regex: /\d{3,6}-\d{2,6}-\d{4,6}/g,
  },
];
