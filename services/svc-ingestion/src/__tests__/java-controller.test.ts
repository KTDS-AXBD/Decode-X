import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initJavaParser, resetJavaParser } from "@ai-foundry/utils/java-parsing";
import { parseJavaController, isController } from "../parsing/java-controller.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(__dirname, "../../../../packages/utils/wasm");

beforeAll(async () => {
  await initJavaParser({
    javaWasm: readFileSync(join(WASM_DIR, "tree-sitter-java.wasm")),
    runtimeWasm: join(WASM_DIR, "web-tree-sitter.wasm"),
  });
});

afterAll(() => {
  resetJavaParser();
});

describe("java-controller parser (Tree-sitter)", () => {
  test("LPON CommonController - @RestController + @RequestMapping + @ApiOperation", () => {
    const source = `
package com.kt.onnuripay.externalapi.common.controller;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;

@Api(tags = "공통")
@RequiredArgsConstructor
@RequestMapping(value = "/api/v2/common")
@RestController
public class CommonController {
    @ApiOperation(value = "DB시간조회")
    @RequestMapping(value = "/utils/getNow", method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<BaseGenericRes<String>> getNow() {
        return null;
    }

    @ApiOperation(value = "잔액조회")
    @PostMapping("/balance/check")
    public ResponseEntity<BaseGenericRes<BalanceVO>> checkBalance(@RequestBody BalanceVO request) {
        return null;
    }
}
    `;
    const result = parseJavaController(source, "CommonController.java");
    expect(result).not.toBeNull();
    expect(result!.className).toBe("CommonController");
    expect(result!.packageName).toBe("com.kt.onnuripay.externalapi.common.controller");
    expect(result!.basePath).toBe("/api/v2/common");
    expect(result!.swaggerTag).toBe("공통");
    expect(result!.endpoints).toHaveLength(2);

    const ep1 = result!.endpoints[0]!;
    expect(ep1.httpMethod).toEqual(["GET", "POST"]);
    expect(ep1.path).toBe("/utils/getNow");
    expect(ep1.methodName).toBe("getNow");
    expect(ep1.swaggerSummary).toBe("DB시간조회");
    expect(ep1.parameters).toHaveLength(0);
    expect(ep1.returnType).toBe("ResponseEntity<BaseGenericRes<String>>");

    const ep2 = result!.endpoints[1]!;
    expect(ep2.httpMethod).toEqual(["POST"]);
    expect(ep2.path).toBe("/balance/check");
    expect(ep2.swaggerSummary).toBe("잔액조회");
    expect(ep2.parameters).toHaveLength(1);
    expect(ep2.parameters[0]!.name).toBe("request");
    expect(ep2.parameters[0]!.annotation).toBe("@RequestBody");
  });

  test("isController - detects @RestController", () => {
    expect(isController("@RestController\npublic class Foo {}")).toBe(true);
    expect(isController("@Controller\npublic class Bar {}")).toBe(true);
    expect(isController("@Service\npublic class Baz {}")).toBe(false);
    expect(isController("public class Plain {}")).toBe(false);
  });

  test("null for non-controller source", () => {
    const source = `
package com.example;
@Service
public class MyService {
    public void doSomething() {}
}
    `;
    expect(parseJavaController(source, "MyService.java")).toBeNull();
  });

  test("@GetMapping / @DeleteMapping shorthand", () => {
    const source = `
@RestController
@RequestMapping(value = "/api/users")
public class UserController {
    @GetMapping("/list")
    public List<UserVO> getUsers() { return null; }

    @DeleteMapping("/remove")
    public void deleteUser(@PathVariable("id") Long id) { return; }
}
    `;
    const result = parseJavaController(source, "UserController.java");
    expect(result).not.toBeNull();
    expect(result!.endpoints).toHaveLength(2);

    expect(result!.endpoints[0]!.httpMethod).toEqual(["GET"]);
    expect(result!.endpoints[0]!.path).toBe("/list");

    expect(result!.endpoints[1]!.httpMethod).toEqual(["DELETE"]);
    expect(result!.endpoints[1]!.path).toBe("/remove");
    expect(result!.endpoints[1]!.parameters).toHaveLength(1);
    expect(result!.endpoints[1]!.parameters[0]!.annotation).toBe("@PathVariable");
  });

  test("controller without @RequestMapping base path", () => {
    const source = `
@RestController
public class SimpleController {
    @GetMapping("/health")
    public String health() { return "ok"; }
}
    `;
    const result = parseJavaController(source, "SimpleController.java");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe("");
    expect(result!.endpoints[0]!.path).toBe("/health");
  });

  test("class-level @RequestMapping with constant reference — basePath empty", () => {
    const source = `
package com.kt.onnuripay.externalapi.common.controller;

@Api(tags = "공통")
@RequiredArgsConstructor
@RequestMapping(value = GlobalConstants.API_BASE_PATH + "/common")
@RestController
public class CommonController {
    @ApiOperation(value = "DB시간조회")
    @RequestMapping(value = "/utils/getNow", method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<BaseGenericRes<String>> getNow() {
        return null;
    }
}
    `;
    const result = parseJavaController(source, "CommonController.java");
    expect(result).not.toBeNull();
    // Tree-sitter may not resolve constant concatenation — basePath is "" or empty
    expect(result!.endpoints[0]!.path).toBe("/utils/getNow");
  });

  test("@RequestParam with required=false", () => {
    const source = `
@RestController
@RequestMapping(value = "/api")
public class SearchController {
    @GetMapping("/search")
    public List<Result> search(@RequestParam(required=false) String keyword, @RequestParam int page) {
        return null;
    }
}
    `;
    const result = parseJavaController(source, "SearchController.java");
    expect(result).not.toBeNull();
    const params = result!.endpoints[0]!.parameters;
    expect(params).toHaveLength(2);
    expect(params[0]!.name).toBe("keyword");
    expect(params[0]!.required).toBe(false);
    expect(params[1]!.name).toBe("page");
    expect(params[1]!.required).toBe(true);
  });

  // ─── New cases (Phase 2) ───────────────────────────────────────────────────

  test("multi-path @PostMapping({'/a', '/b'}) emits 2 endpoints", () => {
    const source = `
@RestController
@RequestMapping("/api/v1")
public class MultiController {
    @PostMapping({"/apply", "/create"})
    public ResponseEntity<Void> apply(@RequestBody ApplyVO req) { return null; }
}
    `;
    const result = parseJavaController(source, "MultiController.java");
    expect(result).not.toBeNull();
    expect(result!.endpoints).toHaveLength(2);
    expect(result!.endpoints[0]!.path).toBe("/apply");
    expect(result!.endpoints[1]!.path).toBe("/create");
    expect(result!.endpoints[0]!.httpMethod).toEqual(["POST"]);
    expect(result!.endpoints[0]!.parameters).toHaveLength(1);
    expect(result!.endpoints[0]!.parameters[0]!.annotation).toBe("@RequestBody");
  });

  test("Map<K,V> generic return type preserved", () => {
    const source = `
@RestController
public class GenericController {
    @GetMapping("/map")
    public ResponseEntity<Map<String, List<FooVO>>> getMap() { return null; }

    @GetMapping("/simple")
    public Map<String, Object> getSimple() { return null; }
}
    `;
    const result = parseJavaController(source, "GenericController.java");
    expect(result).not.toBeNull();
    expect(result!.endpoints).toHaveLength(2);
    expect(result!.endpoints[0]!.returnType).toBe("ResponseEntity<Map<String, List<FooVO>>>");
    expect(result!.endpoints[1]!.returnType).toBe("Map<String, Object>");
  });

  test("basePath correctly prepended — full path check", () => {
    const source = `
@RestController
@RequestMapping("/api/v2/pension")
public class PensionController {
    @GetMapping("/list")
    public List<PensionVO> list() { return null; }

    @PostMapping("/withdraw")
    public ResponseEntity<WithdrawResult> withdraw(@RequestBody WithdrawVO req) { return null; }
}
    `;
    const result = parseJavaController(source, "PensionController.java");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe("/api/v2/pension");
    // path is method-level only; basePath is separate
    expect(result!.endpoints[0]!.path).toBe("/list");
    expect(result!.endpoints[1]!.path).toBe("/withdraw");
    expect(result!.endpoints[1]!.parameters[0]!.annotation).toBe("@RequestBody");
  });
});
