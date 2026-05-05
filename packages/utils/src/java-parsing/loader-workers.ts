import { Parser, Language } from "web-tree-sitter";
import { setParser } from "./loader.js";

// wrangler [[rules]] type="CompiledWasm" converts .wasm to WebAssembly.Module at build time
// @ts-expect-error — no TS type for CompiledWasm import
import runtimeWasm from "../../wasm/web-tree-sitter.wasm";
// @ts-expect-error — no TS type for CompiledWasm import
import javaWasm from "../../wasm/tree-sitter-java.wasm";

export async function initJavaParserWorkers(): Promise<void> {
  // In non-Workers environments (e.g. Vitest with WASM null plugin) skip silently
  if (!runtimeWasm || !javaWasm) return;

  await Parser.init({
    instantiateWasm(
      imports: WebAssembly.Imports,
      receive: (inst: WebAssembly.Instance, mod: WebAssembly.Module) => void,
    ) {
      // WebAssembly.instantiate(Module, imports) = instantiation only (no compilation = CF Workers safe)
      WebAssembly.instantiate(runtimeWasm as WebAssembly.Module, imports).then(
        (instance: WebAssembly.Instance) => {
          receive(instance, runtimeWasm as WebAssembly.Module);
        },
      );
    },
  } as unknown as object);

  const parser = new Parser();
  // Language.load patched to accept WebAssembly.Module (web-tree-sitter+0.26.8.patch hunk 3)
  const lang = await Language.load(javaWasm as unknown as Uint8Array);
  parser.setLanguage(lang);
  setParser(parser);
}
