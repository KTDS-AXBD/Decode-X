import { describe, it, expect } from "vitest";
import { validateFileFormat, isScdsa002Encrypted, classifyParseError } from "../parsing/validator.js";

describe("validateFileFormat", () => {
  it("accepts valid PDF header", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const result = validateFileFormat(pdf.buffer, "pdf");
    expect(result.valid).toBe(true);
    expect(result.label).toBe("%PDF");
  });

  it("accepts valid OOXML (PK) header for xlsx", () => {
    const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = validateFileFormat(xlsx.buffer, "xlsx");
    expect(result.valid).toBe(true);
    expect(result.label).toBe("ZIP/PK");
  });

  it("accepts valid OOXML (PK) header for docx", () => {
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = validateFileFormat(docx.buffer, "docx");
    expect(result.valid).toBe(true);
  });

  it("accepts valid OOXML (PK) header for pptx", () => {
    const pptx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = validateFileFormat(pptx.buffer, "pptx");
    expect(result.valid).toBe(true);
  });

  it("accepts valid OLE2 header for xls", () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const result = validateFileFormat(xls.buffer, "xls");
    expect(result.valid).toBe(true);
    expect(result.label).toBe("OLE2");
  });

  it("accepts valid PNG header", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = validateFileFormat(png.buffer, "png");
    expect(result.valid).toBe(true);
    expect(result.label).toBe("PNG");
  });

  it("accepts valid JPEG header", () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateFileFormat(jpg.buffer, "jpg");
    expect(result.valid).toBe(true);
    expect(result.label).toBe("JPEG");
  });

  it("detects SCDSA002 encrypted header for xlsx", () => {
    const scdsa = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32]);
    const result = validateFileFormat(scdsa.buffer, "xlsx");
    expect(result.valid).toBe(false);
    expect(result.label).toBe("SCDSA002");
    expect(result.error).toContain("SCDSA002");
    expect(result.error).toContain("decryption required");
  });

  it("detects SCDSA002 encrypted header for docx", () => {
    const scdsa = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32, 0x00, 0x00]);
    const result = validateFileFormat(scdsa.buffer, "docx");
    expect(result.valid).toBe(false);
    expect(result.label).toBe("SCDSA002");
    expect(result.error).toContain("Samsung SDS");
  });

  it("detects SCDSA002 even with trailing data after magic bytes", () => {
    // Simulate a real encrypted file: SCDSA002 header + random data
    const data = new Uint8Array(1024);
    data.set([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32]);
    for (let i = 8; i < 1024; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    const result = validateFileFormat(data.buffer, "xlsx");
    expect(result.valid).toBe(false);
    expect(result.label).toBe("SCDSA002");
  });

  it("rejects zeroed header for pdf", () => {
    const zeroes = new Uint8Array(10);
    const result = validateFileFormat(zeroes.buffer, "pdf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("%PDF");
  });

  it("allows unknown file types (e.g. txt) without validation", () => {
    const any = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const result = validateFileFormat(any.buffer, "txt");
    expect(result.valid).toBe(true);
    expect(result.label).toBeNull();
  });

  it("rejects files too small to identify", () => {
    const tiny = new Uint8Array([0x50, 0x4b]);
    const result = validateFileFormat(tiny.buffer, "xlsx");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too small");
  });
});

describe("isScdsa002Encrypted", () => {
  it("returns true for exact SCDSA002 magic bytes", () => {
    const buf = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(true);
  });

  it("returns true for SCDSA002 with trailing data", () => {
    const buf = new Uint8Array(256);
    buf.set([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x32]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(true);
  });

  it("returns false for normal ZIP/PK header (valid xlsx)", () => {
    const buf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });

  it("returns false for OLE2 header (valid xls)", () => {
    const buf = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });

  it("returns false for PDF header", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });

  it("returns false for buffer smaller than 8 bytes", () => {
    const buf = new Uint8Array([0x53, 0x43, 0x44, 0x53]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    const buf = new Uint8Array(0);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });

  it("returns false for partial SCDSA prefix", () => {
    // "SCDSA001" — different version
    const buf = new Uint8Array([0x53, 0x43, 0x44, 0x53, 0x41, 0x30, 0x30, 0x31]);
    expect(isScdsa002Encrypted(buf.buffer)).toBe(false);
  });
});

describe("classifyParseError", () => {
  it("classifies AbortError as timeout", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(classifyParseError(err)).toBe("timeout");
  });

  it("classifies timeout message as timeout", () => {
    expect(classifyParseError(new Error("Request timeout after 60s"))).toBe("timeout");
  });

  it("classifies network errors", () => {
    expect(classifyParseError(new Error("network error occurred"))).toBe("network_error");
  });

  it("classifies fetch failed as network_error", () => {
    expect(classifyParseError(new Error("fetch failed"))).toBe("network_error");
  });

  it("classifies generic errors as parse_error", () => {
    expect(classifyParseError(new Error("Unexpected token"))).toBe("parse_error");
  });

  it("classifies non-Error as parse_error", () => {
    expect(classifyParseError("string error")).toBe("parse_error");
  });
});
