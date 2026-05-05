import { describe, test, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initJavaParserNode, getJavaParser, isJavaParserReady } from "../java-parsing/loader.js";
import { extractClasses } from "../java-parsing/extractor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = resolve(__dirname, "../../wasm");

beforeAll(async () => {
  await initJavaParserNode(WASM_DIR);
});

describe("java-parsing — loader", () => {
  test("initJavaParserNode initializes singleton", () => {
    expect(isJavaParserReady()).toBe(true);
  });

  test("getJavaParser returns same instance on repeated calls", () => {
    const p1 = getJavaParser();
    const p2 = getJavaParser();
    expect(p1).toBe(p2);
  });

  test("initJavaParserNode is idempotent", async () => {
    const p1 = getJavaParser();
    await initJavaParserNode(WASM_DIR);
    expect(getJavaParser()).toBe(p1);
  });
});

describe("java-parsing — extractClasses", () => {
  test("controller detection — @RestController", () => {
    const source = `
package com.example;
@RestController
@RequestMapping("/api")
public class MyController {
    @GetMapping("/list")
    public List<String> list() { return null; }
}`;
    const classes = extractClasses(source, getJavaParser());
    expect(classes).toHaveLength(1);
    expect(classes[0]!.kind).toBe("controller");
    expect(classes[0]!.basePath).toBe("/api");
    expect(classes[0]!.endpoints).toHaveLength(1);
    expect(classes[0]!.endpoints[0]!.httpMethods).toEqual(["GET"]);
  });

  test("basePath extraction from @RequestMapping", () => {
    const source = `
package com.kt.lpon;
@RestController
@RequestMapping(value = "/api/v2/pension")
public class PensionController {
    @PostMapping("/apply")
    public String apply() { return null; }
}`;
    const classes = extractClasses(source, getJavaParser());
    const ctrl = classes.find((c) => c.kind === "controller");
    expect(ctrl?.basePath).toBe("/api/v2/pension");
    expect(ctrl?.endpoints[0]!.fullPath).toBe("/api/v2/pension/apply");
  });

  test("multi-path @PostMapping({'/a', '/b'})", () => {
    const source = `
@RestController
public class MultiController {
    @PostMapping({"/create", "/add"})
    public String create() { return null; }
}`;
    const classes = extractClasses(source, getJavaParser());
    const ctrl = classes.find((c) => c.kind === "controller");
    expect(ctrl?.endpoints).toHaveLength(2);
    const paths = ctrl?.endpoints.map((e) => e.methodPath).sort();
    expect(paths).toEqual(["/add", "/create"]);
  });

  test("Map<K,V> generic return type preserved", () => {
    const source = `
@RestController
public class GenericController {
    @GetMapping("/map")
    public Map<String, List<FooVO>> getData() { return null; }
}`;
    const classes = extractClasses(source, getJavaParser());
    const ep = classes.find((c) => c.kind === "controller")?.endpoints[0];
    expect(ep?.returnType).toContain("Map<");
    expect(ep?.returnType).toContain("List<");
  });

  test("@Mapper interface detected as mapper kind", () => {
    const source = `
package com.example.mapper;
@Mapper
public interface UserMapper {
    UserVO findById(Long id);
}`;
    const classes = extractClasses(source, getJavaParser());
    expect(classes[0]!.kind).toBe("mapper");
  });

  test("non-controller source returns empty controllers", () => {
    const source = `
package com.example;
@Service
public class MyService {
    public void doWork() {}
}`;
    const classes = extractClasses(source, getJavaParser());
    const controllers = classes.filter((c) => c.kind === "controller");
    expect(controllers).toHaveLength(0);
  });
});
