import { Parser, Language } from "web-tree-sitter";

let _parser: Parser | null = null;

export interface JavaParserInitOpts {
  javaWasm: Uint8Array;
  runtimeWasm?: Uint8Array | string;
}

export async function initJavaParser(opts: JavaParserInitOpts): Promise<void> {
  if (_parser) return;

  if (typeof opts.runtimeWasm === "string") {
    await Parser.init({ locateFile: () => opts.runtimeWasm as string });
  } else if (opts.runtimeWasm instanceof Uint8Array) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Parser.init({ wasmBinary: opts.runtimeWasm } as any);
  } else {
    await Parser.init();
  }

  const Java = await Language.load(opts.javaWasm);
  const parser = new Parser();
  parser.setLanguage(Java);
  _parser = parser;
}

export function getJavaParser(): Parser {
  if (!_parser) throw new Error("Java parser not initialized. Call initJavaParser() first.");
  return _parser;
}

export function resetJavaParser(): void {
  _parser = null;
}
