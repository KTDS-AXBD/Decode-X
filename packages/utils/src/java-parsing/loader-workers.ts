// This file is imported ONLY in Cloudflare Workers (not in tests).
// Wrangler's [[rules]] type="Data" converts .wasm imports to ArrayBuffer.
// @ts-expect-error — no TypeScript type for CompiledWasm/Data WASM import
import javaWasmBuffer from "../../wasm/tree-sitter-java.wasm";
// @ts-expect-error — no TypeScript type for CompiledWasm/Data WASM import
import runtimeWasmBuffer from "../../wasm/web-tree-sitter.wasm";
import { initJavaParser } from "./loader.js";

export async function initJavaParserWorkers(): Promise<void> {
  await initJavaParser({
    javaWasm: new Uint8Array(javaWasmBuffer as ArrayBuffer),
    runtimeWasm: new Uint8Array(runtimeWasmBuffer as ArrayBuffer),
  });
}
