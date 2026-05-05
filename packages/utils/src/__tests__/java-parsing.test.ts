import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initJavaParser, resetJavaParser, extractClasses, getJavaParser } from "../java-parsing/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(__dirname, "../../wasm");

beforeAll(async () => {
  await initJavaParser({
    javaWasm: readFileSync(join(WASM_DIR, "tree-sitter-java.wasm")),
    runtimeWasm: join(WASM_DIR, "web-tree-sitter.wasm"),
  });
});

afterAll(() => {
  resetJavaParser();
});

describe("java-parsing shared module", () => {
  test("extracts controller kind and basePath", () => {
    const source = `
package com.example;

@RestController
@RequestMapping("/api/v1")
public class TestCtrl {
    @GetMapping("/ping")
    public String ping() { return "pong"; }
}
    `;
    const parser = getJavaParser();
    const classes = extractClasses(source, parser);
    expect(classes).toHaveLength(1);
    const cls = classes[0]!;
    expect(cls.kind).toBe("controller");
    expect(cls.basePath).toBe("/api/v1");
    expect(cls.endpoints).toHaveLength(1);
    expect(cls.endpoints[0]!.httpMethods).toEqual(["GET"]);
    expect(cls.endpoints[0]!.methodPath).toBe("/ping");
    expect(cls.endpoints[0]!.returnType).toBe("String");
  });

  test("detects mapper kind for @Mapper interface", () => {
    const source = `
package com.example.mapper;

@Mapper
public interface UserMapper {
    UserVO selectUser(Long id);
}
    `;
    const classes = extractClasses(source, getJavaParser());
    expect(classes).toHaveLength(1);
    expect(classes[0]!.kind).toBe("mapper");
  });

  test("multi-path annotation emits multiple endpoints", () => {
    const source = `
@RestController
public class MultiCtrl {
    @PostMapping({"/a", "/b", "/c"})
    public void handle() {}
}
    `;
    const classes = extractClasses(source, getJavaParser());
    expect(classes[0]!.endpoints).toHaveLength(3);
    expect(classes[0]!.endpoints[0]!.methodPath).toBe("/a");
    expect(classes[0]!.endpoints[2]!.methodPath).toBe("/c");
  });

  test("generic return type Map<K,V> is fully captured", () => {
    const source = `
@RestController
public class FooCtrl {
    @GetMapping("/data")
    public Map<String, List<BarVO>> getData() { return null; }
}
    `;
    const classes = extractClasses(source, getJavaParser());
    expect(classes[0]!.endpoints[0]!.returnType).toBe("Map<String, List<BarVO>>");
  });

  test("@RequestParam(required=false) sets required=false", () => {
    const source = `
@RestController
public class SearchCtrl {
    @GetMapping("/search")
    public List<Item> search(@RequestParam(required=false) String q, @RequestParam int page) {
        return null;
    }
}
    `;
    const classes = extractClasses(source, getJavaParser());
    const params = classes[0]!.endpoints[0]!.parameters;
    expect(params).toHaveLength(2);
    expect(params[0]!.required).toBe(false);
    expect(params[1]!.required).toBe(true);
  });

  test("initJavaParser is idempotent (double-call safe)", async () => {
    await initJavaParser({
      javaWasm: readFileSync(join(WASM_DIR, "tree-sitter-java.wasm")),
      runtimeWasm: join(WASM_DIR, "web-tree-sitter.wasm"),
    });
    const parser = getJavaParser();
    expect(parser).toBeTruthy();
  });
});
