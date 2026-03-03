import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseXlsx,
  detectSiSubtype,
  buildWorkbookSummary,
  sheetToMarkdownChunks,
  extractProgramMeta,
} from "../parsing/xlsx.js";
import { shouldSkipSheet } from "../parsing/screen-design.js";

// ── Helpers ─────────────────────────────────────────────────────

function createWorkbook(
  sheets: Array<{ name: string; data: string[][] }>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  // XLSX.write with type:"array" returns a plain Array of numbers
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
  return new Uint8Array(arr).buffer as ArrayBuffer;
}

function getWorkbook(sheets: Array<{ name: string; data: string[][] }>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

// ── detectSiSubtype ─────────────────────────────────────────────

describe("detectSiSubtype", () => {
  it("detects 화면설계 from filename", () => {
    expect(detectSiSubtype("화면설계서_SCRN001.xlsx")).toBe("화면설계");
    expect(detectSiSubtype("퇴직연금_화면 설계_v2.xlsx")).toBe("화면설계");
  });

  it("detects 프로그램설계 from filename", () => {
    expect(detectSiSubtype("프로그램설계서_PGM001.xlsx")).toBe("프로그램설계");
    expect(detectSiSubtype("PGM설계_퇴직연금.xlsx")).toBe("프로그램설계");
  });

  it("detects 테이블정의 from filename", () => {
    expect(detectSiSubtype("테이블정의서_TB001.xlsx")).toBe("테이블정의");
    expect(detectSiSubtype("테이블목록.xlsx")).toBe("테이블정의");
    expect(detectSiSubtype("테이블설계서.xlsx")).toBe("테이블정의");
  });

  it("detects 배치설계 from filename", () => {
    expect(detectSiSubtype("배치설계서_BAT001.xlsx")).toBe("배치설계");
    expect(detectSiSubtype("배치정의_야간.xlsx")).toBe("배치설계");
  });

  it("detects 인터페이스설계 from filename", () => {
    expect(detectSiSubtype("인터페이스설계서_IF001.xlsx")).toBe("인터페이스설계");
    expect(detectSiSubtype("I/F설계_대외연동.xlsx")).toBe("인터페이스설계");
  });

  it("detects 단위테스트 from filename", () => {
    expect(detectSiSubtype("단위테스트케이스_UTC001.xlsx")).toBe("단위테스트");
  });

  it("detects 통합테스트 from filename", () => {
    expect(detectSiSubtype("통합테스트시나리오.xlsx")).toBe("통합테스트");
  });

  it("detects 요구사항 from filename", () => {
    expect(detectSiSubtype("요구사항정의서.xlsx")).toBe("요구사항");
  });

  it("detects 업무규칙 from filename", () => {
    expect(detectSiSubtype("업무규칙정의서_BR001.xlsx")).toBe("업무규칙");
  });

  it("detects 코드정의 from filename", () => {
    expect(detectSiSubtype("코드정의서.xlsx")).toBe("코드정의");
  });

  it("detects 공통 from filename", () => {
    expect(detectSiSubtype("공통모듈설계서.xlsx")).toBe("공통");
    expect(detectSiSubtype("공통설계_유틸.xlsx")).toBe("공통");
  });

  it("returns unknown for unrecognized filename", () => {
    expect(detectSiSubtype("data_export.xlsx")).toBe("unknown");
    expect(detectSiSubtype("매출보고서.xlsx")).toBe("unknown");
  });
});

// ── buildWorkbookSummary ────────────────────────────────────────

describe("buildWorkbookSummary", () => {
  it("produces summary with sheet info", () => {
    const wb = getWorkbook([
      { name: "시트1", data: [["ID", "이름", "상태"], ["1", "홍길동", "활성"]] },
      { name: "시트2", data: [["코드", "설명"], ["A01", "기본"]] },
    ]);
    const summary = buildWorkbookSummary(wb, "화면설계", "화면설계서.xlsx");
    expect(summary).not.toBeNull();
    expect(summary!.type).toBe("XlWorkbook");
    expect(summary!.text).toContain("화면설계서.xlsx");
    expect(summary!.text).toContain("SI Subtype: 화면설계");
    expect(summary!.text).toContain("Sheets: 2");
    expect(summary!.text).toContain("시트1");
    expect(summary!.text).toContain("시트2");
    expect(summary!.text).toContain("ID, 이름, 상태");
    expect(summary!.metadata).toEqual({ siSubtype: "화면설계", sheetCount: 2 });
  });

  it("returns null for empty workbook", () => {
    const wb = XLSX.utils.book_new();
    const summary = buildWorkbookSummary(wb, "unknown", "empty.xlsx");
    expect(summary).toBeNull();
  });

  it("includes row/col dimensions in summary", () => {
    const wb = getWorkbook([
      { name: "Data", data: [["A", "B", "C"], ["1", "2", "3"], ["4", "5", "6"]] },
    ]);
    const summary = buildWorkbookSummary(wb, "테이블정의", "테이블정의서.xlsx");
    expect(summary!.text).toContain("3 rows × 3 cols");
  });
});

// ── sheetToMarkdownChunks ───────────────────────────────────────

describe("sheetToMarkdownChunks", () => {
  it("converts sheet to Markdown table", () => {
    const wb = getWorkbook([
      { name: "Sheet1", data: [["ID", "Name"], ["1", "Alice"], ["2", "Bob"]] },
    ]);
    const sheet = wb.Sheets["Sheet1"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Sheet1", "화면설계");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe("XlSheet:화면설계");
    expect(chunks[0]!.text).toContain("| ID | Name |");
    expect(chunks[0]!.text).toContain("| --- | --- |");
    expect(chunks[0]!.text).toContain("| 1 | Alice |");
    expect(chunks[0]!.text).toContain("| 2 | Bob |");
  });

  it("chunks large sheets by maxRows", () => {
    const rows: string[][] = [["Col1", "Col2"]];
    for (let i = 1; i <= 100; i++) {
      rows.push([`row${i}`, `val${i}`]);
    }
    const wb = getWorkbook([{ name: "Big", data: rows }]);
    const sheet = wb.Sheets["Big"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Big", "unknown", 40);

    // 100 data rows / 40 = 3 chunks
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.text).toContain("[1/3]");
    expect(chunks[1]!.text).toContain("[2/3]");
    expect(chunks[2]!.text).toContain("[3/3]");
  });

  it("skips empty sheets", () => {
    const wb = getWorkbook([{ name: "Empty", data: [[""]] }]);
    const sheet = wb.Sheets["Empty"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Empty", "unknown");
    expect(chunks).toHaveLength(0);
  });

  it("handles header-only sheets", () => {
    const wb = getWorkbook([{ name: "Headers", data: [["A", "B", "C"]] }]);
    const sheet = wb.Sheets["Headers"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Headers", "요구사항");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("[1/1]");
    expect(chunks[0]!.text).toContain("| A | B | C |");
  });

  it("skips chunks where all data rows are empty", () => {
    const rows: string[][] = [["H1", "H2"]];
    // 40 empty rows then 1 data row
    for (let i = 0; i < 40; i++) rows.push(["", ""]);
    rows.push(["data1", "data2"]);

    const wb = getWorkbook([{ name: "Sparse", data: rows }]);
    const sheet = wb.Sheets["Sparse"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Sparse", "unknown", 40);

    // First chunk (40 empty rows) should be skipped, second chunk has data
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("data1");
  });

  it("escapes pipe characters in cell content", () => {
    const wb = getWorkbook([
      { name: "S", data: [["Col"], ["A|B"]] },
    ]);
    const sheet = wb.Sheets["S"]!;
    const chunks = sheetToMarkdownChunks(sheet, "S", "unknown");

    expect(chunks[0]!.text).toContain("A\\|B");
  });

  it("includes metadata with chunk position info", () => {
    const wb = getWorkbook([
      { name: "Meta", data: [["A"], ["1"], ["2"]] },
    ]);
    const sheet = wb.Sheets["Meta"]!;
    const chunks = sheetToMarkdownChunks(sheet, "Meta", "프로그램설계");

    expect(chunks[0]!.metadata).toEqual(
      expect.objectContaining({
        sheetName: "Meta",
        siSubtype: "프로그램설계",
        chunkIndex: 0,
        totalChunks: 1,
      }),
    );
  });
});

// ── parseXlsx (integration) ────────────────────────────────────

describe("parseXlsx", () => {
  it("parses simple xlsx file", () => {
    const buf = createWorkbook([
      { name: "Sheet1", data: [["ID", "Name"], ["1", "Alice"]] },
    ]);
    const elements = parseXlsx(buf, "data.xlsx");

    // 1 workbook summary + 1 sheet chunk
    expect(elements).toHaveLength(2);
    expect(elements[0]!.type).toBe("XlWorkbook");
    expect(elements[1]!.type).toBe("XlSheet:unknown");
  });

  it("detects SI subtype from filename", () => {
    const buf = createWorkbook([
      { name: "화면목록", data: [["화면ID", "화면명"], ["SCR001", "로그인"]] },
    ]);
    const elements = parseXlsx(buf, "화면설계서_v1.xlsx");

    expect(elements[1]!.type).toBe("XlSheet:화면설계");
    expect(elements[0]!.text).toContain("SI Subtype: 화면설계");
  });

  it("handles multi-sheet workbook", () => {
    const buf = createWorkbook([
      { name: "Sheet1", data: [["A"], ["1"]] },
      { name: "Sheet2", data: [["B"], ["2"]] },
      { name: "Sheet3", data: [["C"], ["3"]] },
    ]);
    const elements = parseXlsx(buf, "report.xlsx");

    // 1 summary + 3 sheet chunks
    expect(elements).toHaveLength(4);
    expect(elements[0]!.type).toBe("XlWorkbook");
  });

  it("handles empty workbook", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[""]]), "Empty");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const elements = parseXlsx(new Uint8Array(arr).buffer as ArrayBuffer, "empty.xlsx");

    // Summary only (empty sheet produces no chunks)
    expect(elements).toHaveLength(1);
    expect(elements[0]!.type).toBe("XlWorkbook");
  });

  it("handles large workbook with chunking", () => {
    const rows: string[][] = [["Col1", "Col2"]];
    for (let i = 1; i <= 120; i++) {
      rows.push([`r${i}`, `v${i}`]);
    }
    const buf = createWorkbook([{ name: "Data", data: rows }]);
    const elements = parseXlsx(buf, "테이블정의서.xlsx");

    // 1 summary + 3 chunks (120 / 40)
    expect(elements).toHaveLength(4);
    expect(elements[0]!.type).toBe("XlWorkbook");
    expect(elements[1]!.type).toBe("XlSheet:테이블정의");
  });

  it("preserves Korean characters", () => {
    const buf = createWorkbook([
      { name: "한글시트", data: [["이름", "부서"], ["홍길동", "퇴직연금팀"]] },
    ]);
    const elements = parseXlsx(buf, "test.xlsx");

    expect(elements[1]!.text).toContain("홍길동");
    expect(elements[1]!.text).toContain("퇴직연금팀");
  });

  it("handles XLS (BIFF) format via SheetJS", () => {
    // SheetJS also supports .xls — verify the parser accepts bookType: "biff8"
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"], ["1"]]), "S1");
    const arr = XLSX.write(wb, { type: "array", bookType: "biff8" }) as number[];
    const elements = parseXlsx(new Uint8Array(arr).buffer as ArrayBuffer, "legacy.xls");

    expect(elements.length).toBeGreaterThanOrEqual(2);
    expect(elements[0]!.type).toBe("XlWorkbook");
  });

  it("truncates cells exceeding MAX_CELL_LENGTH", () => {
    const longText = "x".repeat(3000);
    const buf = createWorkbook([
      { name: "S", data: [["Col"], [longText]] },
    ]);
    const elements = parseXlsx(buf, "test.xlsx");
    const sheetChunk = elements.find((e) => e.type.startsWith("XlSheet:"));
    expect(sheetChunk).toBeDefined();
    // Should be truncated to ~2000 + "…"
    expect(sheetChunk!.text.length).toBeLessThan(longText.length);
  });

  it("handles sheets with merged cells gracefully", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Merged Header", "", "Col3"],
      ["data1", "data2", "data3"],
    ]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MergedSheet");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];

    const elements = parseXlsx(new Uint8Array(arr).buffer as ArrayBuffer, "merged.xlsx");
    const sheetChunk = elements.find((e) => e.type.startsWith("XlSheet:"));
    expect(sheetChunk).toBeDefined();
    expect(sheetChunk!.text).toContain("Merged Header");
  });

  it("replaces newlines in cell content", () => {
    const buf = createWorkbook([
      { name: "S", data: [["Col"], ["line1\nline2"]] },
    ]);
    const elements = parseXlsx(buf, "test.xlsx");
    const sheetChunk = elements.find((e) => e.type.startsWith("XlSheet:"));
    // Newlines within cells should be replaced with spaces for table format
    expect(sheetChunk!.text).toContain("line1 line2");
  });

  it("skips noise sheets (표지, 제개정이력, 샘플)", () => {
    const buf = createWorkbook([
      { name: "표지", data: [["Title"], ["퇴직연금 프로젝트"]] },
      { name: "제개정이력", data: [["버전", "일자"], ["1.0", "2026-01-01"]] },
      { name: "샘플", data: [["Guide"], ["작성 예시"]] },
      { name: "화면목록", data: [["화면ID", "화면명"], ["SCR001", "로그인"]] },
    ]);
    const elements = parseXlsx(buf, "화면설계서.xlsx");

    // Only 화면목록 sheet should produce chunks; 표지/제개정이력/샘플 skipped
    const sheetChunks = elements.filter((e) => e.type.startsWith("XlSheet:"));
    expect(sheetChunks).toHaveLength(1);
    expect(sheetChunks[0]!.text).toContain("화면목록");
    expect(sheetChunks[0]!.text).not.toContain("표지");
  });

  it("tracks skipped sheet count in workbook summary metadata", () => {
    const buf = createWorkbook([
      { name: "표지", data: [["Title"], ["Cover"]] },
      { name: "제개정이력", data: [["Revision"], ["1.0"]] },
      { name: "Data", data: [["Col"], ["val"]] },
    ]);
    const elements = parseXlsx(buf, "test.xlsx");
    const summary = elements[0];
    expect(summary).toBeDefined();
    expect(summary!.type).toBe("XlWorkbook");
    expect(summary!.text).toContain("2 skipped");
    const meta = summary!.metadata as Record<string, unknown>;
    expect(meta["skippedSheets"]).toBe(2);
  });

  it("extracts 프로그램설계서 metadata from R3-R4", () => {
    // Build program design sheet with meta rows
    const buf = createWorkbook([
      {
        name: "PGM001",
        data: [
          // Row 0: title row
          ["퇴직연금 시스템 재구축 프로젝트", "", "", "", "", "프로그램설계서"],
          // Row 1: empty
          ["", "", "", "", "", ""],
          // Row 2: 프로그램ID, 프로그램명
          ["프로그램 ID(BeanID)", "BEAN_PGM001", "", "프로그램 명", "퇴직연금 가입처리", ""],
          // Row 3: 고객담당자, 설계담당자
          ["고객담당자", "김고객", "", "설계담당자", "이설계", ""],
          // Row 4: empty
          ["", "", "", "", "", ""],
          // Row 5: column headers
          ["No", "항목", "설명", "비고", "타입", "필수"],
          // Row 6+: data
          ["1", "가입자ID", "가입자 식별자", "", "String", "Y"],
          ["2", "상품코드", "퇴직연금 상품", "", "String", "Y"],
        ],
      },
    ]);
    const elements = parseXlsx(buf, "프로그램설계서_PGM001.xlsx");

    // Should have: summary + meta + data chunk(s)
    expect(elements.length).toBeGreaterThanOrEqual(3);

    const meta = elements.find((e) => e.type === "XlProgramMeta");
    expect(meta).toBeDefined();
    expect(meta!.text).toContain("프로그램설계서: 퇴직연금 가입처리");
    expect(meta!.text).toContain("프로그램ID: BEAN_PGM001");
    expect(meta!.text).toContain("고객담당자: 김고객");
    expect(meta!.text).toContain("설계담당자: 이설계");

    const metaData = meta!.metadata as Record<string, unknown>;
    expect(metaData["programId"]).toBe("BEAN_PGM001");
    expect(metaData["programName"]).toBe("퇴직연금 가입처리");
  });

  it("uses row 5 as header for 프로그램설계서 data", () => {
    const buf = createWorkbook([
      {
        name: "PGM002",
        data: [
          ["프로젝트명", "", "", "", "", "프로그램설계서"],
          ["", "", "", "", "", ""],
          ["프로그램 ID", "PGM002", "", "프로그램 명", "해지처리", ""],
          ["고객담당자", "박담당", "", "설계담당자", "최설계", ""],
          ["", "", "", "", "", ""],
          ["No", "항목명", "설명", "타입", "비고", "필수"],
          ["1", "해지일자", "해지 요청일", "Date", "", "Y"],
        ],
      },
    ]);
    const elements = parseXlsx(buf, "프로그램설계서_PGM002.xlsx");

    // Data chunks should use row 5 as headers, not row 0
    const dataChunks = elements.filter((e) => e.type === "XlSheet:프로그램설계");
    expect(dataChunks.length).toBeGreaterThanOrEqual(1);
    expect(dataChunks[0]!.text).toContain("| No | 항목명 |");
    expect(dataChunks[0]!.text).toContain("해지일자");
    // Should NOT contain the meta row content as table data
    expect(dataChunks[0]!.text).not.toContain("프로그램 ID");
  });
});

// ── shouldSkipSheet ─────────────────────────────────────────────

describe("shouldSkipSheet", () => {
  it("skips 표지 sheet (exact match)", () => {
    expect(shouldSkipSheet("표지")).toBe(true);
  });

  it("skips 제개정이력 sheet (exact match)", () => {
    expect(shouldSkipSheet("제개정이력")).toBe(true);
  });

  it("skips sheets matching 샘플 regex", () => {
    expect(shouldSkipSheet("샘플")).toBe(true);
    expect(shouldSkipSheet("샘플시트")).toBe(true);
  });

  it("skips sheets matching 작성가이드 regex", () => {
    expect(shouldSkipSheet("작성가이드")).toBe(true);
    expect(shouldSkipSheet("작성가이드(참고)")).toBe(true);
  });

  it("skips sheets matching 명명규칙 regex", () => {
    expect(shouldSkipSheet("명명규칙")).toBe(true);
  });

  it("does not skip normal data sheets", () => {
    expect(shouldSkipSheet("화면목록")).toBe(false);
    expect(shouldSkipSheet("PGM001")).toBe(false);
    expect(shouldSkipSheet("데이터")).toBe(false);
    expect(shouldSkipSheet("시트1")).toBe(false);
  });
});

// ── shouldSkipSheet integration with parseXlsx ──────────────────

describe("shouldSkipSheet integration in parseXlsx", () => {
  it("skips 작성가이드 and 명명규칙 sheets in parseXlsx output", () => {
    const buf = createWorkbook([
      { name: "작성가이드", data: [["가이드"], ["작성 방법"]] },
      { name: "명명규칙", data: [["규칙"], ["ID 명명"]] },
      { name: "DataSheet", data: [["No", "항목"], ["1", "데이터"]] },
    ]);
    // Use a non-프로그램설계 filename to avoid dataStartRow=5 offset
    const elements = parseXlsx(buf, "요구사항정의서.xlsx");

    // Only DataSheet should produce sheet chunks
    const sheetChunks = elements.filter((e) => e.type.startsWith("XlSheet:"));
    expect(sheetChunks).toHaveLength(1);
    expect(sheetChunks[0]!.text).toContain("데이터");
    const allText = elements.map((e) => e.text).join(" ");
    expect(allText).not.toContain("작성 방법");
    expect(allText).not.toContain("ID 명명");
  });

  it("produces no sheet chunks when all sheets are noise", () => {
    const buf = createWorkbook([
      { name: "표지", data: [["Title"]] },
      { name: "제개정이력", data: [["Version"]] },
      { name: "샘플시트", data: [["Sample"]] },
    ]);
    const elements = parseXlsx(buf, "test.xlsx");

    const sheetChunks = elements.filter((e) => e.type.startsWith("XlSheet:"));
    expect(sheetChunks).toHaveLength(0);
    // Workbook summary should still exist
    expect(elements[0]!.type).toBe("XlWorkbook");
    expect(elements[0]!.text).toContain("3 skipped");
  });
});

// ── extractProgramMeta ──────────────────────────────────────────

describe("extractProgramMeta", () => {
  it("extracts meta from valid program design sheet", () => {
    const wb = getWorkbook([
      {
        name: "PGM001",
        data: [
          ["프로젝트명", "", "", "", "", "프로그램설계서"],
          ["", "", "", "", "", ""],
          ["프로그램 ID", "BEAN001", "", "프로그램 명", "가입처리", ""],
          ["고객담당자", "홍길동", "", "설계담당자", "김설계", ""],
        ],
      },
    ]);
    const sheet = wb.Sheets["PGM001"]!;
    const meta = extractProgramMeta(sheet, "PGM001");

    expect(meta).not.toBeNull();
    expect(meta!.type).toBe("XlProgramMeta");
    expect(meta!.text).toContain("프로그램ID: BEAN001");
    expect(meta!.text).toContain("프로그램명: 가입처리");
    expect(meta!.text).toContain("고객담당자: 홍길동");
    expect(meta!.text).toContain("설계담당자: 김설계");
  });

  it("returns null for sheets with too few rows", () => {
    const wb = getWorkbook([
      { name: "Small", data: [["A"], ["B"]] },
    ]);
    const sheet = wb.Sheets["Small"]!;
    const meta = extractProgramMeta(sheet, "Small");
    expect(meta).toBeNull();
  });

  it("returns null when no meta fields have values", () => {
    const wb = getWorkbook([
      {
        name: "Empty",
        data: [
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
        ],
      },
    ]);
    const sheet = wb.Sheets["Empty"]!;
    const meta = extractProgramMeta(sheet, "Empty");
    expect(meta).toBeNull();
  });

  it("uses sheetName as title fallback when programName is empty", () => {
    const wb = getWorkbook([
      {
        name: "MySheet",
        data: [
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["프로그램 ID", "ID001", "", "프로그램 명", ""],
          ["고객담당자", "", "", "설계담당자", ""],
        ],
      },
    ]);
    const sheet = wb.Sheets["MySheet"]!;
    const meta = extractProgramMeta(sheet, "MySheet");
    expect(meta).not.toBeNull();
    expect(meta!.text).toContain("프로그램설계서: MySheet");
  });

  it("returns null for sheet with exactly 3 rows (needs row index 3)", () => {
    const wb = getWorkbook([
      {
        name: "ThreeRows",
        data: [
          ["Row0"],
          ["Row1"],
          ["Row2"],
        ],
      },
    ]);
    const sheet = wb.Sheets["ThreeRows"]!;
    const meta = extractProgramMeta(sheet, "ThreeRows");
    // range.e.r = 2, which is < 3, so should return null
    expect(meta).toBeNull();
  });

  it("returns null for sheet with exactly 1 row", () => {
    const wb = getWorkbook([
      { name: "OneRow", data: [["SingleCell"]] },
    ]);
    const sheet = wb.Sheets["OneRow"]!;
    const meta = extractProgramMeta(sheet, "OneRow");
    expect(meta).toBeNull();
  });

  it("extracts only programId when other fields are empty", () => {
    const wb = getWorkbook([
      {
        name: "PartialMeta",
        data: [
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["프로그램 ID", "BEAN_ONLY", "", "프로그램 명", ""],
          ["고객담당자", "", "", "설계담당자", ""],
        ],
      },
    ]);
    const sheet = wb.Sheets["PartialMeta"]!;
    const meta = extractProgramMeta(sheet, "PartialMeta");
    expect(meta).not.toBeNull();
    expect(meta!.text).toContain("프로그램ID: BEAN_ONLY");
    const metaData = meta!.metadata as Record<string, unknown>;
    expect(metaData["programId"]).toBe("BEAN_ONLY");
    expect(metaData["programName"]).toBe("");
  });
});
