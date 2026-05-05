import { Parser } from "web-tree-sitter";
// @ts-expect-error — wrangler [[rules]] type="CompiledWasm" produces WebAssembly.Module
import compiledWasm from "./web-tree-sitter.wasm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

function makeInitOptions(log: string[]): AnyObj {
  return {
    instantiateWasm(imports: WebAssembly.Imports, receive: (inst: WebAssembly.Instance, mod: WebAssembly.Module) => void) {
      log.push("instantiateWasm called");
      WebAssembly.instantiate(compiledWasm as WebAssembly.Module, imports)
        .then((instance: WebAssembly.Instance) => {
          log.push(`instantiate resolved: exports=${Object.keys(instance.exports).length}`);
          receive(instance, compiledWasm as WebAssembly.Module);
          log.push("receive called");
        })
        .catch((err: Error) => {
          log.push(`instantiate failed: ${err.message}`);
        });
    },
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/health") return Response.json({ ok: true });

    if (pathname === "/check") {
      return Response.json({
        wasmType: Object.prototype.toString.call(compiledWasm),
        isModule: compiledWasm instanceof WebAssembly.Module,
      });
    }

    const log: string[] = ["start"];

    const timeout = new Promise<Response>((resolve) =>
      setTimeout(() => resolve(Response.json({ status: "timeout", log }, { status: 504 })), 8000)
    );

    const work = (async () => {
      try {
        const opts = makeInitOptions(log);
        log.push("calling Parser.init");
        await Parser.init(opts);
        log.push("Parser.init resolved");
        const parser = new Parser();
        log.push("parser created");
        return Response.json({ status: "ok", message: "web-tree-sitter loaded in CF Workers ✓", log });
      } catch (e: unknown) {
        const err = e as Error;
        log.push(`error: ${err.message}`);
        return Response.json({ status: "error", message: err.message, log }, { status: 500 });
      }
    })();

    return Promise.race([work, timeout]);
  },
};
