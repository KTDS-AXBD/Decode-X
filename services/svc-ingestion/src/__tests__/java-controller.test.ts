import { describe, test, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initJavaParserNode } from "@ai-foundry/utils/java-parsing";
import { parseJavaController, isController } from "../parsing/java-controller.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = resolve(__dirname, "../../../../packages/utils/wasm");

beforeAll(async () => {
  await initJavaParserNode(WASM_DIR);
});

describe("java-controller parser", () => {
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

  test("class-level @RequestMapping with constant reference — basePath empty, no method path leak", () => {
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
    // basePath should be "" (constant reference not parseable), NOT "/utils/getNow"
    expect(result!.basePath).toBe("");
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
  });

  test("multi-path @PostMapping({'/create', '/add'})", () => {
    const source = `
@RestController
@RequestMapping("/api/items")
public class ItemController {
    @PostMapping({"/create", "/add"})
    public String createItem() { return null; }
}
    `;
    const result = parseJavaController(source, "ItemController.java");
    expect(result).not.toBeNull();
    expect(result!.endpoints).toHaveLength(2);
    const paths = result!.endpoints.map((e) => e.path).sort();
    expect(paths).toEqual(["/add", "/create"]);
    expect(result!.endpoints[0]!.httpMethod).toEqual(["POST"]);
  });

  test("Map<K,V> generic return type preserved", () => {
    const source = `
@RestController
@RequestMapping("/api/data")
public class DataController {
    @GetMapping("/stats")
    public Map<String, List<StatVO>> getStats() { return null; }
}
    `;
    const result = parseJavaController(source, "DataController.java");
    expect(result).not.toBeNull();
    const ep = result!.endpoints[0]!;
    expect(ep.returnType).toContain("Map<");
    expect(ep.returnType).toContain("List<");
  });

  test("fullPath combines basePath + methodPath correctly", () => {
    const source = `
@RestController
@RequestMapping("/api/v2/pension")
public class PensionController {
    @PostMapping("/apply")
    public String apply() { return null; }

    @GetMapping("/status")
    public String status() { return null; }
}
    `;
    const result = parseJavaController(source, "PensionController.java");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe("/api/v2/pension");
    expect(result!.endpoints).toHaveLength(2);
    expect(result!.endpoints[0]!.path).toBe("/apply");
    expect(result!.endpoints[1]!.path).toBe("/status");
  });

  test("@PutMapping + @PatchMapping HTTP methods", () => {
    const source = `
@RestController
@RequestMapping("/api/v1/users")
public class UserUpdateController {
    @PutMapping("/{id}")
    public UserVO replaceUser(@PathVariable Long id, @RequestBody UserVO user) { return null; }

    @PatchMapping("/{id}/status")
    public void updateStatus(@PathVariable Long id, @RequestParam String status) { return; }
}
    `;
    const result = parseJavaController(source, "UserUpdateController.java");
    expect(result).not.toBeNull();
    expect(result!.endpoints).toHaveLength(2);

    const put = result!.endpoints[0]!;
    expect(put.httpMethod).toEqual(["PUT"]);
    expect(put.parameters).toHaveLength(2);
    expect(put.parameters[0]!.annotation).toBe("@PathVariable");
    expect(put.parameters[1]!.annotation).toBe("@RequestBody");

    const patch = result!.endpoints[1]!;
    expect(patch.httpMethod).toEqual(["PATCH"]);
    expect(patch.parameters).toHaveLength(2);
  });
});
