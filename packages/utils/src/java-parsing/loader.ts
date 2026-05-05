import { Parser, Language } from "web-tree-sitter";

let _parser: Parser | null = null;

export function setParser(p: Parser): void {
  _parser = p;
}

export function getJavaParser(): Parser {
  if (!_parser) throw new Error("Java parser not initialized. Call initJavaParser*() first.");
  return _parser;
}

export function isJavaParserReady(): boolean {
  return _parser !== null;
}

export async function initJavaParserNode(wasmDir: string): Promise<Parser> {
  if (_parser) return _parser;
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const runtimePath = join(wasmDir, "web-tree-sitter.wasm");
  const javaPath = join(wasmDir, "tree-sitter-java.wasm");

  await Parser.init({ locateFile: () => runtimePath });
  const parser = new Parser();
  const javaBytes = readFileSync(javaPath);
  const lang = await Language.load(javaBytes);
  parser.setLanguage(lang);
  _parser = parser;
  return _parser;
}
