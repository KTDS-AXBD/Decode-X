import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
import { extractSourceFiles, parseSourceProject } from "../parsing/zip-extractor.js";

function makeZipBytes(files: Record<string, Uint8Array>): ArrayBuffer {
  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

function javaBytes(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

const SIMPLE_CONTROLLER = `
package com.example;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api")
public class HelloController {
  @GetMapping("/hello")
  public String hello() { return "Hello"; }
}
`;

const LARGE_CONTENT = "x".repeat(600 * 1024); // 600KB

describe("extractSourceFiles — ExtractionStats", () => {
  it("counts stats correctly for mixed zip", () => {
    const zip = makeZipBytes({
      "src/main/java/Hello.java": javaBytes(SIMPLE_CONTROLLER),
      "src/main/java/Service.java": javaBytes("public class Service {}"),
      "src/main/java/Test.java": javaBytes("// test"),
      "src/main/sql/schema.sql": new TextEncoder().encode("CREATE TABLE t (id INT);"),
      "build/Hello.class": new Uint8Array([0xca, 0xfe, 0xba, 0xbe]),
      "icon.png": new Uint8Array([0x89, 0x50]),
    });
    const { files, stats } = extractSourceFiles(zip);

    // Test.java + .class + .png → SKIP_PATTERNS match → skippedBinary=3
    expect(stats.skippedBinary).toBe(3);
    expect(stats.oversizedSkipped).toBe(0);
    expect(stats.cappedAtMaxFiles).toBe(false);
    expect(stats.extracted).toBe(files.length);
    expect(stats.totalEntries).toBeGreaterThanOrEqual(4);
  });

  it("counts oversizedSkipped for a large file", () => {
    const zip = makeZipBytes({
      "src/Big.java": javaBytes(LARGE_CONTENT),
      "src/Small.java": javaBytes("public class Small {}"),
    });
    const { stats } = extractSourceFiles(zip);

    expect(stats.oversizedSkipped).toBe(1);
    expect(stats.extracted).toBe(1);
    const expectedRate = Math.round((1 / 2) * 100) / 100;
    expect(stats.totalEntries).toBe(2);
    // extractionRate computed in parseSourceProject
    expect(expectedRate).toBe(0.5);
  });

  it("handles empty zip gracefully", () => {
    const zip = makeZipBytes({});
    const { files, stats } = extractSourceFiles(zip);
    expect(files.length).toBe(0);
    expect(stats.totalEntries).toBe(0);
    expect(stats.extracted).toBe(0);
    expect(stats.cappedAtMaxFiles).toBe(false);
  });
});

describe("parseSourceProject — stats 14 fields", () => {
  it("includes 5 new stats fields when extractionStats provided", () => {
    const zip = makeZipBytes({
      "src/Big.java": javaBytes(LARGE_CONTENT),
      "src/Small.java": javaBytes("public class Small {}"),
    });
    const { files, stats } = extractSourceFiles(zip);
    const elements = parseSourceProject(files, "test-project", stats);

    const summary = elements.find((e) => e.type === "SourceProjectSummary");
    expect(summary).toBeDefined();
    const parsed = JSON.parse(summary!.text) as { projectName: string; stats: Record<string, unknown> };
    expect(parsed.projectName).toBe("test-project");
    expect(parsed.stats["totalEntriesInZip"]).toBeDefined();
    expect(parsed.stats["skippedBinaryCount"]).toBeDefined();
    expect(parsed.stats["oversizedSkippedCount"]).toBeDefined();
    expect(parsed.stats["extractionRate"]).toBeDefined();
    expect(parsed.stats["cappedAtMaxFiles"]).toBeDefined();
    // oversized=1, total=2 → rate = 0.5
    expect(parsed.stats["extractionRate"]).toBe(0.5);
    expect(parsed.stats["oversizedSkippedCount"]).toBe(1);
  });

  it("extractionRate is 1 when no entries are skipped", () => {
    const zip = makeZipBytes({
      "src/Hello.java": javaBytes("public class Hello {}"),
    });
    const { files, stats } = extractSourceFiles(zip);
    const elements = parseSourceProject(files, "clean-project", stats);
    const summary = elements.find((e) => e.type === "SourceProjectSummary");
    const parsed = JSON.parse(summary!.text) as { stats: Record<string, unknown> };
    expect(parsed.stats["extractionRate"]).toBe(1);
  });

  it("omits new stats fields when extractionStats not provided", () => {
    const files = [
      { path: "src/Hello.java", filename: "Hello.java", content: "public class Hello {}", type: "java" as const },
    ];
    const elements = parseSourceProject(files, "no-stats");
    const summary = elements.find((e) => e.type === "SourceProjectSummary");
    const parsed = JSON.parse(summary!.text) as { stats: Record<string, unknown> };
    expect(parsed.stats["totalEntriesInZip"]).toBeUndefined();
    expect(parsed.stats["extractionRate"]).toBeUndefined();
  });
});
