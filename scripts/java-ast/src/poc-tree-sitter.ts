/**
 * F358 Phase 1 PoC — Tree-sitter Java 파서 Workers 호환성 검증
 *
 * 검증 항목:
 *   1. web-tree-sitter WASM 로드 (Workers-compatible Uint8Array 패턴)
 *   2. tree-sitter-java grammar 파싱 정확도
 *   3. regex CLI 결과 vs Tree-sitter AST diff (silent drift 검출)
 *   4. 성능 측정 (parse ms, WASM 메모리 footprint)
 *
 * 실행: cd scripts/java-ast && npx tsx src/poc-tree-sitter.ts [--out reports/f358-poc-...json]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Parser, Language } from "web-tree-sitter";
import type { Node as TSNode } from "web-tree-sitter";
import { runAnalysis } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const WASM_RUNTIME = join(PACKAGE_ROOT, "node_modules/web-tree-sitter/web-tree-sitter.wasm");
const WASM_JAVA = join(PACKAGE_ROOT, "node_modules/tree-sitter-java/tree-sitter-java.wasm");
const SAMPLES_DIR = join(PACKAGE_ROOT, "samples");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Endpoint {
  httpMethod: string;
  fullPath: string;
  methodPath: string;
  methodName: string;
  returnType: string;
  paramCount: number;
}

interface ClassInfo {
  className: string;
  packageName: string;
  kind: "controller" | "service" | "entity" | "mapper" | "other";
  basePath: string;
  endpoints: Endpoint[];
  fields: Array<{ name: string; type: string }>;
}

interface DiffItem {
  kind:
    | "base_path_missing"
    | "path_incomplete"
    | "return_type_generic_loss"
    | "mapper_skipped"
    | "field_type_generic_loss";
  file: string;
  detail: string;
  regexValue: string;
  tsValue: string;
}

interface WasmStats {
  grammarSizeBytes: number;
  runtimeSizeBytes: number;
  totalWasmKb: number;
  wasmCompileMs: number;
  languageLoadMs: number;
  parserInitMs: number;
}

interface SampleOutput {
  file: string;
  sizeBytes: number;
  parseMs: number;
  tsClasses: ClassInfo[];
  regexSummary: {
    controllerCount: number;
    endpointCount: number;
    dataModelCount: number;
    serviceCount: number;
  };
  diffs: DiffItem[];
}

interface PocReport {
  timestamp: string;
  wasmStats: WasmStats;
  samples: SampleOutput[];
  summary: {
    totalSamples: number;
    totalParseMs: number;
    avgParseMsPerFile: number;
    avgParseMsPerKb: number;
    silentDriftsDetected: number;
    diffsByKind: Record<string, number>;
    workersCompatibility: "PASS" | "FAIL";
    phase2Recommendation: "GO" | "NOGO";
    phase2Notes: string;
  };
}

// ─── WASM Loader ──────────────────────────────────────────────────────────────

async function initTreeSitter(): Promise<{ stats: WasmStats; java: Language }> {
  const grammarBytes = readFileSync(WASM_JAVA);
  const runtimeBytes = readFileSync(WASM_RUNTIME);

  // Workers-compatible pattern: WebAssembly.compile() directly validates WASM binary
  const compileStart = performance.now();
  await WebAssembly.compile(grammarBytes);
  const wasmCompileMs = performance.now() - compileStart;

  // Init web-tree-sitter runtime
  const initStart = performance.now();
  await Parser.init({ locateFile: () => WASM_RUNTIME });
  const parserInitMs = performance.now() - initStart;

  // Load Java grammar (Workers equiv: Language.load(new Uint8Array(await fetch(url).arrayBuffer())))
  const loadStart = performance.now();
  const Java = await Language.load(grammarBytes);
  const languageLoadMs = performance.now() - loadStart;

  if (!Java) throw new Error("Language.load() returned null — grammar WASM invalid");

  const stats: WasmStats = {
    grammarSizeBytes: grammarBytes.length,
    runtimeSizeBytes: runtimeBytes.length,
    totalWasmKb: Math.round((grammarBytes.length + runtimeBytes.length) / 1024),
    wasmCompileMs: Math.round(wasmCompileMs * 100) / 100,
    languageLoadMs: Math.round(languageLoadMs * 100) / 100,
    parserInitMs: Math.round(parserInitMs * 100) / 100,
  };

  return { stats, java: Java };
}

// ─── AST Extraction ───────────────────────────────────────────────────────────

const HTTP_METHODS: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
  RequestMapping: "GET",
};

function annotationName(node: TSNode): string {
  return node.children.find((c: TSNode) => c.type === "identifier")?.text ?? "";
}

function annotationPath(node: TSNode): string {
  const args = node.children.find((c: TSNode) => c.type === "annotation_argument_list");
  if (!args) return "";
  // Case 1: @Mapping("/path") — direct string literal
  const str = args.children.find((c: TSNode) => c.type === "string_literal");
  if (str) return str.text.slice(1, -1);
  // Case 2: @Mapping(value = "/path") — element_value_pair
  const pair = args.children.find((c: TSNode) => c.type === "element_value_pair");
  const pairStr = pair?.children.find((c: TSNode) => c.type === "string_literal");
  return pairStr ? pairStr.text.slice(1, -1) : "";
}

function extractModifiers(mods: TSNode | undefined): {
  annotations: Array<{ name: string; path: string }>;
} {
  if (!mods) return { annotations: [] };
  const annotations: Array<{ name: string; path: string }> = [];
  for (const child of mods.children) {
    if (child.type === "marker_annotation" || child.type === "annotation") {
      annotations.push({ name: annotationName(child), path: annotationPath(child) });
    }
  }
  return { annotations };
}

function getReturnType(methodNode: TSNode, modsNode: TSNode | undefined): string {
  const typeNodes = methodNode.children.filter(
    (c: TSNode) =>
      c !== modsNode &&
      c.type !== "identifier" &&
      c.type !== "formal_parameters" &&
      c.type !== "block" &&
      c.type !== "throws" &&
      c.type !== ";" &&
      !["public", "private", "protected", "static", "final", "void"].includes(c.type),
  );
  const first = typeNodes[0];
  return first !== undefined ? first.text : "void";
}

function extractFieldInfo(fieldNode: TSNode): { name: string; type: string } | null {
  // Find variable declarator (may be in variable_declarator_list or direct)
  let varDeclarator: TSNode | undefined;
  const varList = fieldNode.children.find(
    (c: TSNode) => c.type === "variable_declarator_list",
  );
  if (varList) {
    varDeclarator = varList.children.find((c: TSNode) => c.type === "variable_declarator");
  } else {
    varDeclarator = fieldNode.children.find((c: TSNode) => c.type === "variable_declarator");
  }
  const fieldName = varDeclarator?.children.find((c: TSNode) => c.type === "identifier")?.text;
  if (!fieldName) return null;

  const typeNode = fieldNode.children.find(
    (c: TSNode) =>
      c.type !== "modifiers" &&
      c.type !== "variable_declarator_list" &&
      c.type !== "variable_declarator" &&
      c.type !== ";",
  );
  return { name: fieldName, type: typeNode?.text ?? "Object" };
}

function extractClasses(source: string, parser: Parser): ClassInfo[] {
  const tree = parser.parse(source);
  if (!tree) return [];

  const results: ClassInfo[] = [];
  const pkgNode = tree.rootNode.children.find(
    (c: TSNode) => c.type === "package_declaration",
  );
  const packageName = pkgNode?.children.find(
    (c: TSNode) => c.type !== "package" && c.type !== ";",
  )?.text ?? "";

  for (const topNode of tree.rootNode.children) {
    const isClass = topNode.type === "class_declaration";
    const isInterface = topNode.type === "interface_declaration";
    if (!isClass && !isInterface) continue;

    const mods = topNode.children.find((c: TSNode) => c.type === "modifiers");
    const { annotations } = extractModifiers(mods);
    const className = topNode.children.find((c: TSNode) => c.type === "identifier")?.text ?? "Unknown";

    let kind: ClassInfo["kind"] = "other";
    let basePath = "";
    for (const annot of annotations) {
      if (annot.name === "RestController" || annot.name === "Controller") kind = "controller";
      else if (annot.name === "Service" || annot.name === "Component") kind = "service";
      else if (annot.name === "Entity") kind = "entity";
      else if (annot.name === "Mapper") kind = "mapper";
      if (annot.name === "RequestMapping") basePath = annot.path;
    }
    if (isInterface && kind === "other") {
      if (annotations.some((a) => a.name === "Mapper")) kind = "mapper";
    }

    const bodyNode = topNode.children.find(
      (c: TSNode) => c.type === "class_body" || c.type === "interface_body",
    );
    const endpoints: Endpoint[] = [];
    const fields: ClassInfo["fields"] = [];

    for (const member of bodyNode?.children ?? []) {
      if (member.type === "method_declaration") {
        const mMods = member.children.find((c: TSNode) => c.type === "modifiers");
        const { annotations: mAnnots } = extractModifiers(mMods);
        const methodName = member.children.find((c: TSNode) => c.type === "identifier")?.text ?? "";
        const returnType = getReturnType(member, mMods);
        const formalParams = member.children.find((c: TSNode) => c.type === "formal_parameters");
        const paramCount = formalParams?.children.filter(
          (c: TSNode) => c.type === "formal_parameter",
        ).length ?? 0;

        for (const mAnnot of mAnnots) {
          const httpMethod = HTTP_METHODS[mAnnot.name];
          if (httpMethod !== undefined) {
            const methodPath = mAnnot.path || "";
            endpoints.push({
              httpMethod,
              methodPath,
              fullPath: basePath + methodPath,
              methodName,
              returnType,
              paramCount,
            });
          }
        }
      } else if (member.type === "field_declaration") {
        const f = extractFieldInfo(member);
        if (f) fields.push(f);
      }
    }

    results.push({ className, packageName, kind, basePath, endpoints, fields });
  }

  return results;
}

// ─── Diff Analysis ────────────────────────────────────────────────────────────

function analyzeDiffs(
  file: string,
  tsClasses: ClassInfo[],
  regexResult: ReturnType<typeof runAnalysis>,
): DiffItem[] {
  const diffs: DiffItem[] = [];

  for (const tsClass of tsClasses) {
    // Mapper/interface completely skipped by regex
    if (tsClass.kind === "mapper") {
      const regexFound =
        regexResult.controllers.some((c) => c.className === tsClass.className) ||
        regexResult.dataModels.some((m) => m.className === tsClass.className) ||
        regexResult.transactions.some((t) => t.className === tsClass.className);
      if (!regexFound) {
        diffs.push({
          kind: "mapper_skipped",
          file,
          detail: `@Mapper interface ${tsClass.className} completely missing from regex output`,
          regexValue: "(not found)",
          tsValue: `${tsClass.className} — ${tsClass.endpoints.length} mapped methods`,
        });
      }
    }

    // Base path missing in regex
    if (tsClass.kind === "controller" && tsClass.basePath) {
      const regexCtrl = regexResult.controllers.find((c) => c.className === tsClass.className);
      if (regexCtrl && !regexCtrl.basePath) {
        diffs.push({
          kind: "base_path_missing",
          file,
          detail: `${tsClass.className}: class-level @RequestMapping not captured by regex`,
          regexValue: `basePath=""`,
          tsValue: `basePath="${tsClass.basePath}"`,
        });
      }
    }

    // Path incomplete (missing base path in each endpoint)
    if (tsClass.kind === "controller" && tsClass.basePath) {
      const regexCtrl = regexResult.controllers.find((c) => c.className === tsClass.className);
      if (regexCtrl) {
        for (const tsEp of tsClass.endpoints) {
          const regexEp = regexCtrl.endpoints.find((e) => e.methodName === tsEp.methodName);
          if (regexEp && regexEp.path !== tsEp.fullPath) {
            diffs.push({
              kind: "path_incomplete",
              file,
              detail: `${tsClass.className}.${tsEp.methodName}: full API path differs`,
              regexValue: regexEp.path,
              tsValue: tsEp.fullPath,
            });
          }
        }
      }
    }

    // Generic return type loss
    if (tsClass.kind === "controller") {
      const regexCtrl = regexResult.controllers.find((c) => c.className === tsClass.className);
      if (regexCtrl) {
        for (const tsEp of tsClass.endpoints) {
          if (!tsEp.returnType.includes("<")) continue;
          const regexEp = regexCtrl.endpoints.find((e) => e.methodName === tsEp.methodName);
          if (regexEp && regexEp.returnType === "Object") {
            diffs.push({
              kind: "return_type_generic_loss",
              file,
              detail: `${tsClass.className}.${tsEp.methodName}: generic return type stripped by regex`,
              regexValue: regexEp.returnType,
              tsValue: tsEp.returnType,
            });
          }
        }
      }
    }

    // Generic field type loss in entities
    if (tsClass.kind === "entity") {
      const regexModel = regexResult.dataModels.find((m) => m.className === tsClass.className);
      if (regexModel) {
        for (const tsField of tsClass.fields) {
          if (!tsField.type.includes("<")) continue;
          const regexField = regexModel.fields.find((f) => f.name === tsField.name);
          if (regexField && !regexField.type.includes("<")) {
            diffs.push({
              kind: "field_type_generic_loss",
              file,
              detail: `${tsClass.className}.${tsField.name}: generic type info lost in regex`,
              regexValue: regexField.type,
              tsValue: tsField.type,
            });
          }
        }
      }
    }
  }

  return diffs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const outFile = outIdx >= 0 ? argv[outIdx + 1] : undefined;

  console.error("[poc] Initializing tree-sitter WASM runtime...");
  const { stats: wasmStats, java: Java } = await initTreeSitter();

  const parser = new Parser();
  parser.setLanguage(Java);

  console.error(
    `[poc] WASM loaded: grammar=${Math.round(wasmStats.grammarSizeBytes / 1024)}KB ` +
      `runtime=${Math.round(wasmStats.runtimeSizeBytes / 1024)}KB ` +
      `total=${wasmStats.totalWasmKb}KB | ` +
      `WebAssembly.compile=${wasmStats.wasmCompileMs}ms ` +
      `Language.load=${wasmStats.languageLoadMs}ms`,
  );

  // Run regex parser on the whole samples directory
  const regexResult = runAnalysis(SAMPLES_DIR, "lpon-samples", false);

  const sampleFiles = readdirSync(SAMPLES_DIR)
    .filter((f: string) => f.endsWith(".java"))
    .sort();

  const sampleOutputs: SampleOutput[] = [];
  let totalParseMs = 0;
  let totalBytes = 0;

  for (const sampleFile of sampleFiles) {
    const filePath = join(SAMPLES_DIR, sampleFile);
    const source = readFileSync(filePath, "utf8");
    const sizeBytes = statSync(filePath).size;

    const parseStart = performance.now();
    const tsClasses = extractClasses(source, parser);
    const parseMs = Math.round((performance.now() - parseStart) * 100) / 100;

    totalParseMs += parseMs;
    totalBytes += sizeBytes;

    const diffs = analyzeDiffs(sampleFile, tsClasses, regexResult);
    const tsEndpointCount = tsClasses.reduce((n, c) => n + c.endpoints.length, 0);

    console.error(
      `[poc] ${sampleFile}: ${parseMs}ms ${sizeBytes}B | ` +
        `ts: ${tsClasses.length} class(es) ${tsEndpointCount} endpoints | ` +
        `diffs: ${diffs.length}`,
    );

    sampleOutputs.push({
      file: sampleFile,
      sizeBytes,
      parseMs,
      tsClasses,
      regexSummary: {
        controllerCount: regexResult.controllers.filter((c) =>
          tsClasses.some((t) => t.className === c.className),
        ).length,
        endpointCount: regexResult.controllers
          .filter((c) => tsClasses.some((t) => t.className === c.className))
          .reduce((n, c) => n + c.endpoints.length, 0),
        dataModelCount: regexResult.dataModels.filter((m) =>
          tsClasses.some((t) => t.className === m.className),
        ).length,
        serviceCount: regexResult.transactions.filter((t) =>
          tsClasses.some((c) => c.className === t.className),
        ).length,
      },
      diffs,
    });
  }

  const allDiffs = sampleOutputs.flatMap((s) => s.diffs);
  const avgParseMsPerFile = Math.round((totalParseMs / Math.max(sampleFiles.length, 1)) * 100) / 100;
  const avgParseMsPerKb = Math.round((totalParseMs / Math.max(totalBytes / 1024, 0.001)) * 100) / 100;

  const diffsByKind = allDiffs.reduce<Record<string, number>>((acc, d) => {
    acc[d.kind] = (acc[d.kind] ?? 0) + 1;
    return acc;
  }, {});

  const workersCompatibility: "PASS" | "FAIL" =
    wasmStats.totalWasmKb < 50000 && avgParseMsPerFile < 50 ? "PASS" : "FAIL";
  const phase2Go = workersCompatibility === "PASS" && allDiffs.length > 0;

  const report: PocReport = {
    timestamp: new Date().toISOString(),
    wasmStats,
    samples: sampleOutputs,
    summary: {
      totalSamples: sampleFiles.length,
      totalParseMs: Math.round(totalParseMs * 100) / 100,
      avgParseMsPerFile,
      avgParseMsPerKb,
      silentDriftsDetected: allDiffs.length,
      diffsByKind,
      workersCompatibility,
      phase2Recommendation: phase2Go ? "GO" : "NOGO",
      phase2Notes: phase2Go
        ? `Workers-compatible WASM 로드 검증 PASS (${wasmStats.totalWasmKb}KB, ` +
          `${wasmStats.wasmCompileMs}ms compile). ` +
          `regex 대비 ${allDiffs.length}건 silent drift 검출. ` +
          `avg ${avgParseMsPerFile}ms/파일. Phase 2 WASM 번들 방식 진행 권고.`
        : `WorkersCompatibility=${workersCompatibility}, silentDrifts=${allDiffs.length}. ` +
          `NOGO 사유 확인 필요.`,
    },
  };

  const json = JSON.stringify(report, null, 2);
  if (outFile) {
    writeFileSync(outFile, json, "utf8");
    console.error(`[poc] Report written: ${outFile}`);
  } else {
    process.stdout.write(json + "\n");
  }

  console.error(
    `\n[poc] ✅ PoC 완료 | Workers 호환성: ${workersCompatibility} | ` +
      `Phase 2: ${report.summary.phase2Recommendation} | ` +
      `Silent drifts: ${allDiffs.length} | ` +
      `Avg parse: ${avgParseMsPerFile}ms/파일 (${avgParseMsPerKb}ms/KB)`,
  );
}

main().catch((err: unknown) => {
  console.error("[poc] Error:", err);
  process.exit(1);
});
