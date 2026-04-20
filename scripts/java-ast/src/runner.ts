import fs from "node:fs";
import path from "node:path";
import type { SourceAnalysisResult } from "./types.js";

const RE_CONTROLLER = /@(?:Rest)?Controller\b/;
const RE_SERVICE = /@Service\b/;
const RE_ENTITY = /@Entity\b/;
const RE_LOMBOK = /@(?:Data|Getter|Setter|Value)\b/;

const HTTP_ANNOTATIONS: Array<{ re: RegExp; method: string }> = [
  { re: /@GetMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']/, method: "GET" },
  { re: /@PostMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']/, method: "POST" },
  { re: /@PutMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']/, method: "PUT" },
  { re: /@DeleteMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']/, method: "DELETE" },
  { re: /@PatchMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*?)["']/, method: "PATCH" },
];

function pkg(source: string): string {
  return source.match(/^package\s+([\w.]+)\s*;/m)?.[1] ?? "";
}

function cls(source: string, filename: string): string {
  return source.match(/(?:public\s+)?class\s+(\w+)/)?.[1] ?? filename.replace(".java", "");
}

function collectJavaFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJavaFiles(full));
    } else if (entry.name.endsWith(".java")) {
      results.push(full);
    }
  }
  return results;
}

function parseController(
  source: string,
  filename: string,
  result: SourceAnalysisResult,
): void {
  const className = cls(source, filename);
  const packageName = pkg(source);
  const endpoints: SourceAnalysisResult["controllers"][number]["endpoints"] = [];

  const lines = source.split("\n");
  let annotBuf: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("@")) { annotBuf.push(line); continue; }

    if (annotBuf.length > 0 && /^(?:public|protected)\s/.test(line)) {
      const annots = annotBuf.join("\n");
      for (const { re, method } of HTTP_ANNOTATIONS) {
        const m = annots.match(re);
        if (m) {
          const methodName = line.match(/(?:public|protected)\s+\S+\s+(\w+)\s*\(/)?.[1] ?? "unknown";
          const commas = (line.match(/,/g) ?? []).length;
          const hasParams = line.includes("(") && !line.includes("()");
          const paramCount = hasParams ? commas + 1 : 0;
          const rawPath = m[1] ?? "";
          endpoints.push({
            httpMethod: [method],
            path: rawPath.startsWith("/") ? rawPath : `/${rawPath}`,
            methodName,
            parameters: Array.from({ length: paramCount }, (_, idx) => ({
              name: `param${idx}`,
              type: "Object",
              required: true,
            })),
            returnType: "Object",
          });
          break;
        }
      }
      annotBuf = [];
      continue;
    }

    if (!line.startsWith("@") && line.length > 0 && !line.startsWith("//") && !line.startsWith("*")) {
      annotBuf = [];
    }
  }

  result.controllers.push({ className, packageName, basePath: "", endpoints, sourceFile: filename });
  result.stats.controllerCount++;
  result.stats.endpointCount += endpoints.length;
}

function parseDataModel(
  source: string,
  filename: string,
  result: SourceAnalysisResult,
): void {
  const className = cls(source, filename);
  const packageName = pkg(source);
  const fields: SourceAnalysisResult["dataModels"][number]["fields"] = [];

  for (const m of source.matchAll(/(?:private|protected|public)\s+([\S]+(?:<[^;]*?>)?)\s+(\w+)\s*[;=]/g)) {
    fields.push({ name: m[2] ?? "unknown", type: m[1] ?? "Object", nullable: true });
  }

  if (fields.length > 0) {
    result.dataModels.push({ className, packageName, modelType: "vo", fields, sourceFile: filename });
    result.stats.dataModelCount++;
  }
}

function parseService(
  source: string,
  filename: string,
  result: SourceAnalysisResult,
): void {
  const className = cls(source, filename);
  result.transactions.push({
    className,
    methodName: "(service)",
    parameters: [],
    returnType: "void",
    isTransactional: false,
    readOnly: false,
    sourceFile: filename,
    lineNumber: 1,
  });
  result.stats.transactionCount++;
}

export function runAnalysis(dir: string, projectName: string, verbose: boolean): SourceAnalysisResult {
  const result: SourceAnalysisResult = {
    projectName,
    controllers: [],
    dataModels: [],
    transactions: [],
    ddlTables: [],
    stats: {
      totalFiles: 0,
      javaFiles: 0,
      sqlFiles: 0,
      controllerCount: 0,
      endpointCount: 0,
      dataModelCount: 0,
      transactionCount: 0,
      ddlTableCount: 0,
      mapperCount: 0,
    },
  };

  const files = collectJavaFiles(dir);
  result.stats.totalFiles = files.length;
  result.stats.javaFiles = files.length;

  for (const fp of files) {
    const src = fs.readFileSync(fp, "utf8");
    const fn = path.basename(fp);
    if (verbose) process.stderr.write(`  parsing: ${fn}\n`);

    if (RE_CONTROLLER.test(src)) {
      parseController(src, fn, result);
    } else if (RE_SERVICE.test(src)) {
      parseService(src, fn, result);
    } else if (RE_ENTITY.test(src) || RE_LOMBOK.test(src)) {
      parseDataModel(src, fn, result);
    }
  }

  return result;
}
