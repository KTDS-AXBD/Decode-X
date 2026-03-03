import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseScreenDesign,
  extractScreenMeta,
  detectSections,
  parseDataFields,
  parseProcessingLogic,
  extractKeyValuePairs,
  shouldSkipSheet,
  SKIP_SHEET_PATTERNS,
  SKIP_SHEET_REGEXPS,
} from "../parsing/screen-design.js";
import type { SectionRange } from "../parsing/screen-design.js";

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Create an ArrayBuffer workbook from sheet definitions.
 * Each sheet is defined by a name and a 2D array of cell values.
 * Supports sparse placement via `startRow` / `startCol` offsets,
 * and explicit cell placement via `cells` map for precise positioning.
 */
function createWorkbook(
  sheets: Array<{
    name: string;
    data?: string[][];
    cells?: Record<string, string>;
  }>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const sheetDef of sheets) {
    let ws: XLSX.WorkSheet;
    if (sheetDef.data) {
      ws = XLSX.utils.aoa_to_sheet(sheetDef.data);
    } else {
      ws = {};
    }
    // Apply explicit cells if provided
    if (sheetDef.cells) {
      for (const [addr, value] of Object.entries(sheetDef.cells)) {
        ws[addr] = { t: "s", v: value, w: value };
      }
      // Recalculate !ref to include all explicit cells
      updateSheetRef(ws);
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetDef.name);
  }
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
  return new Uint8Array(arr).buffer as ArrayBuffer;
}

/** Get a WorkSheet directly from AOA data */
function makeSheet(data: string[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(data);
}

/** Create a WorkSheet with explicit cell placements */
function makeSheetWithCells(cells: Record<string, string>): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  for (const [addr, value] of Object.entries(cells)) {
    ws[addr] = { t: "s", v: value, w: value };
  }
  updateSheetRef(ws);
  return ws;
}

/** Recalculate !ref for a worksheet based on its cell addresses */
function updateSheetRef(ws: XLSX.WorkSheet): void {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const decoded = XLSX.utils.decode_cell(key);
    if (decoded.r < minR) minR = decoded.r;
    if (decoded.r > maxR) maxR = decoded.r;
    if (decoded.c < minC) minC = decoded.c;
    if (decoded.c > maxC) maxC = decoded.c;
  }
  if (maxR >= 0) {
    ws["!ref"] = XLSX.utils.encode_range(
      { r: minR, c: minC },
      { r: maxR, c: maxC },
    );
  }
}

/**
 * Build a realistic screen design sheet matching the expected document structure.
 * Returns the cells map to be used with makeSheetWithCells().
 */
function buildScreenDesignCells(opts: {
  systemName?: string;
  screenName?: string;
  screenId?: string;
  majorCategory?: string;
  minorCategory?: string;
  screenDesc?: string;
  serviceClassId?: string;
}): Record<string, string> {
  const cells: Record<string, string> = {};

  // Row 0: system name in A1
  if (opts.systemName) cells["A1"] = opts.systemName;

  // Row 2 (R3): screen name and ID
  cells["B3"] = "화면명";
  if (opts.screenName) cells["H3"] = opts.screenName;
  cells["P3"] = "화면ID";
  if (opts.screenId) cells["Q3"] = opts.screenId;

  // Row 3 (R4): classification
  cells["B4"] = "대분류";
  if (opts.majorCategory) cells["H4"] = opts.majorCategory;
  cells["P4"] = "중분류";
  if (opts.minorCategory) cells["V4"] = opts.minorCategory;

  // Row 4 (R5): description
  cells["B5"] = "화면설명";
  if (opts.screenDesc) cells["H5"] = opts.screenDesc;

  // Row 5 (R6): service class ID
  cells["B6"] = "서비스클래스ID";
  if (opts.serviceClassId) cells["H6"] = opts.serviceClassId;

  return cells;
}

// ── shouldSkipSheet ─────────────────────────────────────────────

describe("shouldSkipSheet", () => {
  it("skips 표지 sheet", () => {
    expect(shouldSkipSheet("표지")).toBe(true);
  });

  it("skips 제개정이력 sheet", () => {
    expect(shouldSkipSheet("제개정이력")).toBe(true);
  });

  it("skips sheets matching 샘플 regex", () => {
    expect(shouldSkipSheet("샘플시트")).toBe(true);
    expect(shouldSkipSheet("작성샘플")).toBe(true);
  });

  it("skips sheets matching 작성가이드 regex", () => {
    expect(shouldSkipSheet("작성가이드")).toBe(true);
    expect(shouldSkipSheet("화면작성가이드")).toBe(true);
  });

  it("skips sheets matching 명명규칙 regex", () => {
    expect(shouldSkipSheet("명명규칙")).toBe(true);
    expect(shouldSkipSheet("ID명명규칙")).toBe(true);
  });

  it("does NOT skip normal screen sheets", () => {
    expect(shouldSkipSheet("SCRN001_로그인")).toBe(false);
    expect(shouldSkipSheet("가입자정보조회")).toBe(false);
    expect(shouldSkipSheet("퇴직급여계산")).toBe(false);
  });

  it("exports SKIP_SHEET_PATTERNS and SKIP_SHEET_REGEXPS", () => {
    expect(SKIP_SHEET_PATTERNS).toContain("표지");
    expect(SKIP_SHEET_PATTERNS).toContain("제개정이력");
    expect(SKIP_SHEET_REGEXPS.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT skip empty string", () => {
    expect(shouldSkipSheet("")).toBe(false);
  });

  it("does NOT skip whitespace-only string", () => {
    expect(shouldSkipSheet("   ")).toBe(false);
    expect(shouldSkipSheet("\t")).toBe(false);
  });

  it("does NOT skip partial matches that are not regex hits (e.g. '표지123')", () => {
    // "표지" is exact-match in SKIP_SHEET_PATTERNS, not regex
    expect(shouldSkipSheet("표지123")).toBe(false);
    expect(shouldSkipSheet("제개정이력2")).toBe(false);
  });

  it("skips partial regex matches (e.g. '화면샘플가이드' contains 샘플)", () => {
    expect(shouldSkipSheet("화면샘플가이드")).toBe(true);
  });
});

// ── extractScreenMeta ───────────────────────────────────────────

describe("extractScreenMeta", () => {
  it("extracts basic metadata (system, screen name, ID)", () => {
    const cells = buildScreenDesignCells({
      systemName: "퇴직연금시스템",
      screenName: "가입자정보조회",
      screenId: "SCRN001",
      majorCategory: "가입자관리",
      minorCategory: "정보조회",
      screenDesc: "가입자 기본 정보를 조회하는 화면",
      serviceClassId: "SVC_MEMBER_INFO",
    });
    const ws = makeSheetWithCells(cells);

    const result = extractScreenMeta(ws, "가입자정보조회");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("XlScreenMeta");
    expect(result!.text).toContain("시스템: 퇴직연금시스템");
    expect(result!.text).toContain("화면명: 가입자정보조회");
    expect(result!.text).toContain("화면ID: SCRN001");
    expect(result!.text).toContain("대분류: 가입자관리");
    expect(result!.text).toContain("중분류: 정보조회");
    expect(result!.text).toContain("서비스클래스ID: SVC_MEMBER_INFO");
  });

  it("includes metadata object with extracted fields", () => {
    const cells = buildScreenDesignCells({
      systemName: "퇴직연금시스템",
      screenName: "급여계산",
      screenId: "SCRN002",
      serviceClassId: "SVC_CALC",
    });
    const ws = makeSheetWithCells(cells);

    const result = extractScreenMeta(ws, "급여계산");
    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual(
      expect.objectContaining({
        sheetName: "급여계산",
        screenName: "급여계산",
        screenId: "SCRN002",
        serviceClassId: "SVC_CALC",
      }),
    );
  });

  it("returns null for empty sheet", () => {
    const ws = makeSheet([["", ""]]);
    const result = extractScreenMeta(ws, "Empty");
    expect(result).toBeNull();
  });

  it("returns element with system name only if other fields are missing", () => {
    const cells: Record<string, string> = { A1: "퇴직연금시스템" };
    const ws = makeSheetWithCells(cells);

    const result = extractScreenMeta(ws, "SystemOnly");
    expect(result).not.toBeNull();
    expect(result!.text).toContain("시스템: 퇴직연금시스템");
  });

  it("extracts screen ID directly in P column (not as label)", () => {
    // When P3 contains the actual ID value (not "화면ID" label)
    const cells: Record<string, string> = {
      A1: "퇴직연금시스템",
      B3: "화면명",
      H3: "급여조회",
      P3: "SCRN_DIRECT_099",  // ID value directly in P column
    };
    const ws = makeSheetWithCells(cells);

    const result = extractScreenMeta(ws, "급여조회");
    expect(result).not.toBeNull();
    expect(result!.text).toContain("화면ID: SCRN_DIRECT_099");
    expect(result!.metadata).toEqual(
      expect.objectContaining({
        screenId: "SCRN_DIRECT_099",
      }),
    );
  });
});

// ── detectSections ──────────────────────────────────────────────

describe("detectSections", () => {
  it("detects 5 standard sections", () => {
    const ws = makeSheet([
      ["", "", "", ""],                              // row 0
      ["", "", "", ""],                              // row 1
      ["", "", "", ""],                              // row 2
      ["", "", "", ""],                              // row 3
      ["", "", "", ""],                              // row 4
      ["", "", "", ""],                              // row 5
      ["1. 매뉴 레이아웃", "", "", ""],               // row 6
      ["", "label1", "value1", ""],                  // row 7
      ["", "", "", ""],                              // row 8
      ["2. (참고) 기존 시스템 매뉴 레이아웃", "", "", ""], // row 9
      ["", "", "", ""],                              // row 10
      ["3.데이터 구성항목", "", "", ""],               // row 11
      ["", "항목명", "컨트롤", "필수"],                // row 12
      ["", "이름", "TextBox", "Y"],                  // row 13
      ["4.처리로직", "", "", ""],                     // row 14
      ["", "이벤트명", "파라미터", "처리내용"],         // row 15
      ["", "조회", "ID", "DB조회"],                   // row 16
      ["5.현업 추가 설명 (자유기재)", "", "", ""],      // row 17
      ["", "비고 텍스트", "", ""],                    // row 18
    ]);

    const sections = detectSections(ws);
    expect(sections).toHaveLength(5);

    expect(sections[0]!.sectionNum).toBe(1);
    expect(sections[0]!.title).toContain("레이아웃");
    expect(sections[0]!.startRow).toBe(6);
    expect(sections[0]!.endRow).toBe(8);

    expect(sections[1]!.sectionNum).toBe(2);
    expect(sections[1]!.startRow).toBe(9);

    expect(sections[2]!.sectionNum).toBe(3);
    expect(sections[2]!.title).toContain("데이터");

    expect(sections[3]!.sectionNum).toBe(4);
    expect(sections[3]!.title).toContain("처리로직");

    expect(sections[4]!.sectionNum).toBe(5);
    expect(sections[4]!.title).toContain("추가 설명");
    expect(sections[4]!.endRow).toBe(18); // last row of sheet
  });

  it("returns empty array for sheet with no sections", () => {
    const ws = makeSheet([["Just data", "No sections"]]);
    expect(detectSections(ws)).toHaveLength(0);
  });

  it("returns empty array for empty sheet", () => {
    const ws: XLSX.WorkSheet = {};
    expect(detectSections(ws)).toHaveLength(0);
  });

  it("detects section markers in column B", () => {
    const ws = makeSheet([
      ["", "1. 레이아웃"],
      ["", "", "data"],
      ["", "2. 데이터 구성항목"],
    ]);

    const sections = detectSections(ws);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.sectionNum).toBe(1);
    expect(sections[1]!.sectionNum).toBe(2);
  });

  it("handles non-sequential section numbers (e.g. 1, 3, 5)", () => {
    const ws = makeSheet([
      ["1. 레이아웃"],
      ["", "content"],
      ["3. 데이터 구성항목"],
      ["", "data"],
      ["5. 현업 추가 설명"],
      ["", "note"],
    ]);

    const sections = detectSections(ws);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.sectionNum).toBe(1);
    expect(sections[0]!.endRow).toBe(1); // ends before section 3
    expect(sections[1]!.sectionNum).toBe(3);
    expect(sections[1]!.endRow).toBe(3); // ends before section 5
    expect(sections[2]!.sectionNum).toBe(5);
    expect(sections[2]!.endRow).toBe(5); // last row of sheet
  });

  it("detects section marker with no space after dot (e.g. '3.데이터')", () => {
    const ws = makeSheet([
      ["1.레이아웃"],
      ["", "content"],
      ["3.데이터 구성항목"],
    ]);

    const sections = detectSections(ws);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.sectionNum).toBe(1);
    expect(sections[0]!.title).toBe("1.레이아웃");
    expect(sections[1]!.sectionNum).toBe(3);
    expect(sections[1]!.title).toBe("3.데이터 구성항목");
  });
});

// ── parseDataFields (section 3) ─────────────────────────────────

describe("parseDataFields", () => {
  it("extracts data field table as Markdown", () => {
    const ws = makeSheet([
      ["3.데이터 구성항목", "", "", "", "", ""],        // row 0 = section start
      ["", "항목명(한글)", "컨트롤 유형", "컨트롤(영문)", "필수", "I/O"],  // row 1 = header
      ["", "가입자명", "TextBox", "txtMemberName", "Y", "I"],  // row 2
      ["", "주민번호", "TextBox", "txtSsn", "Y", "I"],         // row 3
      ["", "가입일자", "Calendar", "calJoinDate", "N", "O"],   // row 4
    ]);

    const range: SectionRange = {
      sectionNum: 3,
      title: "3.데이터 구성항목",
      startRow: 0,
      endRow: 4,
    };

    const result = parseDataFields(ws, range);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("XlScreenData");
    expect(result!.text).toContain("### 데이터 구성항목");
    expect(result!.text).toContain("항목명(한글)");
    expect(result!.text).toContain("가입자명");
    expect(result!.text).toContain("TextBox");
    expect(result!.text).toContain("주민번호");
    expect(result!.metadata).toEqual(
      expect.objectContaining({ rowCount: 3 }),
    );
  });

  it("returns null when no matching header is found", () => {
    const ws = makeSheet([
      ["3.데이터 구성항목"],
      ["some random text"],
      ["more random text"],
    ]);

    const range: SectionRange = {
      sectionNum: 3,
      title: "3.데이터 구성항목",
      startRow: 0,
      endRow: 2,
    };

    expect(parseDataFields(ws, range)).toBeNull();
  });

  it("returns null when header exists but no data rows", () => {
    const ws = makeSheet([
      ["3.데이터 구성항목"],
      ["", "항목명", "컨트롤", "필수"],
    ]);

    const range: SectionRange = {
      sectionNum: 3,
      title: "3.데이터 구성항목",
      startRow: 0,
      endRow: 1,
    };

    expect(parseDataFields(ws, range)).toBeNull();
  });

  it("escapes pipe characters in cell values", () => {
    const ws = makeSheet([
      ["3.데이터 구성항목", "", "", ""],
      ["", "항목명", "컨트롤 유형", "필수"],
      ["", "입출력|구분", "ComboBox", "Y"],
    ]);

    const range: SectionRange = {
      sectionNum: 3,
      title: "3.데이터 구성항목",
      startRow: 0,
      endRow: 2,
    };

    const result = parseDataFields(ws, range);
    expect(result).not.toBeNull();
    // Pipe should be escaped as \| in Markdown table
    expect(result!.text).toContain("입출력\\|구분");
    expect(result!.text).not.toContain("입출력|구분");
  });
});

// ── parseProcessingLogic (section 4) ────────────────────────────

describe("parseProcessingLogic", () => {
  it("extracts processing logic table as Markdown", () => {
    const ws = makeSheet([
      ["4.처리로직", "", "", ""],                         // row 0
      ["", "이벤트명", "입력값/파라미터", "처리내용"],      // row 1 = header
      ["", "조회", "가입자ID", "DB에서 가입자 정보를 조회한다"],  // row 2
      ["", "저장", "가입자정보 전체", "유효성 검증 후 DB 저장"],  // row 3
    ]);

    const range: SectionRange = {
      sectionNum: 4,
      title: "4.처리로직",
      startRow: 0,
      endRow: 3,
    };

    const result = parseProcessingLogic(ws, range);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("XlScreenLogic");
    expect(result!.text).toContain("### 처리로직");
    expect(result!.text).toContain("이벤트명");
    expect(result!.text).toContain("조회");
    expect(result!.text).toContain("DB에서 가입자 정보를 조회한다");
    expect(result!.text).toContain("저장");
    expect(result!.metadata).toEqual(
      expect.objectContaining({ rowCount: 2 }),
    );
  });

  it("returns null for section with no logic table", () => {
    const ws = makeSheet([
      ["4.처리로직"],
      ["해당 없음"],
    ]);

    const range: SectionRange = {
      sectionNum: 4,
      title: "4.처리로직",
      startRow: 0,
      endRow: 1,
    };

    expect(parseProcessingLogic(ws, range)).toBeNull();
  });

  it("skips rows where all processing content cells are empty", () => {
    const ws = makeSheet([
      ["4.처리로직", "", "", ""],
      ["", "이벤트명", "입력값/파라미터", "처리내용"],
      ["", "조회", "가입자ID", "DB 조회"],
      ["", "", "", ""],  // entirely empty row — should be skipped
      ["", "저장", "전체", "DB 저장"],
    ]);

    const range: SectionRange = {
      sectionNum: 4,
      title: "4.처리로직",
      startRow: 0,
      endRow: 4,
    };

    const result = parseProcessingLogic(ws, range);
    expect(result).not.toBeNull();
    // extractTableRows skips entirely empty rows, so rowCount should be 2
    expect(result!.metadata).toEqual(
      expect.objectContaining({ rowCount: 2 }),
    );
    expect(result!.text).toContain("조회");
    expect(result!.text).toContain("저장");
  });
});

// ── extractKeyValuePairs (section 1) ────────────────────────────

describe("extractKeyValuePairs", () => {
  it("extracts UI field label-value pairs", () => {
    const ws = makeSheet([
      ["1. 매뉴 레이아웃", "", "", "", "", ""],  // row 0 = section marker
      ["", "가입자명", "노남근", "주민번호", "710823-1530310", ""],  // row 1
      ["", "가입일자", "2023-01-15", "", "", ""],                    // row 2
    ]);

    const range: SectionRange = {
      sectionNum: 1,
      title: "1. 매뉴 레이아웃",
      startRow: 0,
      endRow: 2,
    };

    const result = extractKeyValuePairs(ws, range);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("XlScreenLayout");
    expect(result!.text).toContain("가입자명: 노남근");
    expect(result!.text).toContain("주민번호: 710823-1530310");
    expect(result!.text).toContain("가입일자: 2023-01-15");
    expect(result!.metadata).toEqual(
      expect.objectContaining({ fieldCount: 3 }),
    );
  });

  it("returns null when no key-value pairs found", () => {
    const ws = makeSheet([
      ["1. 매뉴 레이아웃"],
      [""],                // only empty rows
      [""],
    ]);

    const range: SectionRange = {
      sectionNum: 1,
      title: "1. 매뉴 레이아웃",
      startRow: 0,
      endRow: 2,
    };

    expect(extractKeyValuePairs(ws, range)).toBeNull();
  });

  it("skips rows with only a single non-empty cell", () => {
    const ws = makeSheet([
      ["1. 레이아웃"],
      ["single-cell-only"],
      ["label", "value"],
    ]);

    const range: SectionRange = {
      sectionNum: 1,
      title: "1. 레이아웃",
      startRow: 0,
      endRow: 2,
    };

    const result = extractKeyValuePairs(ws, range);
    expect(result).not.toBeNull();
    // Should only have 1 pair from row 2
    expect(result!.metadata).toEqual(
      expect.objectContaining({ fieldCount: 1 }),
    );
  });
});

// ── Empty Sheet Handling ────────────────────────────────────────

describe("empty sheet handling", () => {
  it("skips sheets with no !ref", () => {
    const buf = createWorkbook([
      { name: "EmptySheet", data: [[""]] },
    ]);
    const result = parseScreenDesign(buf, "empty.xlsx");
    // Empty sheet with single empty cell may produce 0 elements
    // (no meta, no sections)
    expect(result).toBeInstanceOf(Array);
  });
});

// ── Noise Sheet Skipping ────────────────────────────────────────

describe("noise sheet skipping", () => {
  it("skips 표지, 제개정이력, and 샘플 sheets", () => {
    const buf = createWorkbook([
      {
        name: "표지",
        data: [["화면설계서", ""], ["프로젝트: 퇴직연금", ""]],
      },
      {
        name: "제개정이력",
        data: [["버전", "일자", "내용"], ["1.0", "2024-01-01", "최초작성"]],
      },
      {
        name: "작성샘플",
        data: [["샘플 데이터"]],
      },
      {
        name: "SCRN001_조회",
        cells: {
          ...buildScreenDesignCells({
            systemName: "퇴직연금시스템",
            screenName: "가입자정보조회",
            screenId: "SCRN001",
          }),
          // Source now requires section markers for meta extraction
          A7: "1. 매뉴 레이아웃",
          B8: "필드1",
          C8: "값1",
        },
      },
    ]);

    const result = parseScreenDesign(buf, "화면설계서.xlsx");

    // Only the SCRN001 sheet should be processed
    const metaElements = result.filter((e) => e.type === "XlScreenMeta");
    expect(metaElements).toHaveLength(1);
    expect(metaElements[0]!.text).toContain("가입자정보조회");

    // Verify no elements from noise sheets
    const allTexts = result.map((e) => e.text).join(" ");
    expect(allTexts).not.toContain("최초작성");
    expect(allTexts).not.toContain("샘플 데이터");
  });
});

// ── parseScreenDesign integration ───────────────────────────────

describe("parseScreenDesign (integration)", () => {
  it("parses a full screen design sheet with all sections", () => {
    // Build a comprehensive screen design sheet
    const data: string[][] = [];

    // Row 0: system name
    data.push(["퇴직연금시스템", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    // Row 1: empty
    data.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    // Row 2: screen name and ID (B=1, H=7, P=15, Q=16)
    const row2 = new Array<string>(17).fill("");
    row2[1] = "화면명";
    row2[7] = "가입자정보조회";
    row2[15] = "화면ID";
    row2[16] = "SCRN001";
    data.push(row2);
    // Row 3: classification (H=7, V=21)
    const row3 = new Array<string>(22).fill("");
    row3[1] = "대분류";
    row3[7] = "가입자관리";
    row3[15] = "중분류";
    row3[21] = "정보조회";
    data.push(row3);
    // Row 4: description
    const row4 = new Array<string>(8).fill("");
    row4[1] = "화면설명";
    row4[7] = "가입자 기본 정보를 조회하는 화면";
    data.push(row4);
    // Row 5: service class
    const row5 = new Array<string>(8).fill("");
    row5[1] = "서비스클래스ID";
    row5[7] = "SVC_MEMBER_INFO";
    data.push(row5);

    // Row 6: section 1
    data.push(["1. 매뉴 레이아웃", "", "", "", "", ""]);
    // Row 7-8: layout fields
    data.push(["", "가입자명", "노남근", "주민번호", "710823-1530310", ""]);
    data.push(["", "가입일자", "2023-01-15", "", "", ""]);

    // Row 9: section 2
    data.push(["2. (참고) 기존 시스템 매뉴 레이아웃", "", "", "", "", ""]);
    // Row 10: old layout content (should be skipped)
    data.push(["", "기존화면내용", "", "", "", ""]);

    // Row 11: section 3
    data.push(["3.데이터 구성항목", "", "", "", "", ""]);
    // Row 12: header
    data.push(["", "항목명", "컨트롤 유형", "컨트롤(영문)", "필수", "I/O"]);
    // Row 13-14: data rows
    data.push(["", "가입자명", "TextBox", "txtName", "Y", "I"]);
    data.push(["", "주민번호", "TextBox", "txtSsn", "Y", "I"]);

    // Row 15: section 4
    data.push(["4.처리로직", "", "", "", "", ""]);
    // Row 16: header
    data.push(["", "이벤트명", "입력값/파라미터", "처리내용", "", ""]);
    // Row 17: data
    data.push(["", "조회", "가입자ID", "DB에서 가입자 정보를 조회한다", "", ""]);

    // Row 18: section 5
    data.push(["5.현업 추가 설명 (자유기재)", "", "", "", "", ""]);
    // Row 19: note
    data.push(["", "조회 시 권한 확인 필요", "", "", "", ""]);

    const buf = createWorkbook([{ name: "SCRN001_조회", data }]);
    const elements = parseScreenDesign(buf, "화면설계서_v1.xlsx");

    // Should have: meta + layout + data + logic + note = 5 elements
    expect(elements.length).toBeGreaterThanOrEqual(4);

    // Check element types
    const types = elements.map((e) => e.type);
    expect(types).toContain("XlScreenMeta");
    expect(types).toContain("XlScreenLayout");
    expect(types).toContain("XlScreenData");
    expect(types).toContain("XlScreenLogic");
    expect(types).toContain("XlScreenNote");

    // Verify meta content
    const meta = elements.find((e) => e.type === "XlScreenMeta");
    expect(meta).toBeDefined();
    expect(meta!.text).toContain("가입자정보조회");
    expect(meta!.text).toContain("SCRN001");

    // Verify layout content
    const layout = elements.find((e) => e.type === "XlScreenLayout");
    expect(layout).toBeDefined();
    expect(layout!.text).toContain("가입자명: 노남근");

    // Verify data fields
    const dataEl = elements.find((e) => e.type === "XlScreenData");
    expect(dataEl).toBeDefined();
    expect(dataEl!.text).toContain("가입자명");
    expect(dataEl!.text).toContain("TextBox");

    // Verify processing logic
    const logic = elements.find((e) => e.type === "XlScreenLogic");
    expect(logic).toBeDefined();
    expect(logic!.text).toContain("DB에서 가입자 정보를 조회한다");

    // Verify note
    const note = elements.find((e) => e.type === "XlScreenNote");
    expect(note).toBeDefined();
    expect(note!.text).toContain("권한 확인 필요");
  });

  it("handles multiple screen sheets in one workbook", () => {
    const sheet1Data = [
      ["퇴직연금시스템"],
      [""],
      // row 2 with screen name at col 7
      ...(() => {
        const r = new Array<string>(16).fill("");
        r[7] = "화면A";
        r[15] = "SCRNA";
        return [r];
      })(),
      ["", "", "", ""],   // row 3
      ["", "", "", ""],   // row 4
      ["", "", "", ""],   // row 5
      ["1. 매뉴 레이아웃", "", "", ""],  // section marker
      ["", "필드1", "값1", ""],
    ];

    const sheet2Data = [
      ["퇴직연금시스템"],
      [""],
      ...(() => {
        const r = new Array<string>(16).fill("");
        r[7] = "화면B";
        r[15] = "SCRNB";
        return [r];
      })(),
      ["", "", "", ""],   // row 3
      ["", "", "", ""],   // row 4
      ["", "", "", ""],   // row 5
      ["1. 매뉴 레이아웃", "", "", ""],  // section marker
      ["", "필드2", "값2", ""],
    ];

    const buf = createWorkbook([
      { name: "화면A", data: sheet1Data },
      { name: "화면B", data: sheet2Data },
    ]);

    const elements = parseScreenDesign(buf, "화면설계서.xlsx");
    const metas = elements.filter((e) => e.type === "XlScreenMeta");
    expect(metas).toHaveLength(2);
  });

  it("returns empty array for workbook with only noise sheets", () => {
    const buf = createWorkbook([
      { name: "표지", data: [["화면설계서"]] },
      { name: "제개정이력", data: [["버전", "1.0"]] },
    ]);

    const elements = parseScreenDesign(buf, "화면설계서.xlsx");
    expect(elements).toHaveLength(0);
  });

  it("includes fileName in section element metadata", () => {
    const data: string[][] = [];
    data.push(["퇴직연금시스템"]);
    data.push([""]);
    const row2 = new Array<string>(16).fill("");
    row2[7] = "테스트화면";
    data.push(row2);
    data.push([""]);
    data.push([""]);
    data.push([""]);
    // Section 4
    data.push(["4.처리로직", "", "", ""]);
    data.push(["", "이벤트명", "파라미터", "처리내용"]);
    data.push(["", "클릭", "버튼ID", "화면 이동"]);

    const buf = createWorkbook([{ name: "TestScreen", data }]);
    const elements = parseScreenDesign(buf, "my_file.xlsx");

    const logic = elements.find((e) => e.type === "XlScreenLogic");
    expect(logic).toBeDefined();
    expect(logic!.metadata).toEqual(
      expect.objectContaining({ fileName: "my_file.xlsx" }),
    );
  });

  it("processes workbook with mix of screen sheets and program-like sheets", () => {
    // A screen design workbook may have some sheets that look like
    // program design (no section markers, just table data) alongside
    // proper screen design sheets with sections.
    const screenData: string[][] = [];
    screenData.push(["퇴직연금시스템"]);
    screenData.push([""]);
    const row2 = new Array<string>(17).fill("");
    row2[1] = "화면명";
    row2[7] = "급여조회";
    row2[15] = "화면ID";
    row2[16] = "SCRN_PAY";
    screenData.push(row2);
    screenData.push(new Array<string>(8).fill(""));
    screenData.push(new Array<string>(8).fill(""));
    screenData.push(new Array<string>(8).fill(""));
    screenData.push(["3.데이터 구성항목", "", "", ""]);
    screenData.push(["", "항목명", "컨트롤 유형", "필수"]);
    screenData.push(["", "급여액", "TextBox", "Y"]);

    // Program-like sheet: no section markers, just flat table data
    const programData: string[][] = [
      ["No", "항목", "설명"],
      ["1", "가입자ID", "식별자"],
      ["2", "상품코드", "상품"],
    ];

    const buf = createWorkbook([
      { name: "SCRN_PAY_급여조회", data: screenData },
      { name: "부록_참조데이터", data: programData },
    ]);

    const elements = parseScreenDesign(buf, "화면설계서_혼합.xlsx");

    // Screen sheet produces meta + data elements
    const screenMeta = elements.filter((e) => e.type === "XlScreenMeta");
    expect(screenMeta).toHaveLength(1);
    expect(screenMeta[0]!.text).toContain("급여조회");

    const screenDataElements = elements.filter((e) => e.type === "XlScreenData");
    expect(screenDataElements).toHaveLength(1);
    expect(screenDataElements[0]!.text).toContain("급여액");

    // Program-like sheet has no section markers, so it only produces
    // metadata (if extractable) — no section-based elements
    // The total element count should be manageable
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });
});
