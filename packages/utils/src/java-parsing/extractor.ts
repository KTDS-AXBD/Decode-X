import type { Parser } from "web-tree-sitter";
import type { Node as TSNode } from "web-tree-sitter";
import type { TsClassInfo, TsEndpoint, TsParam } from "./types.js";

// ─── HTTP method table ────────────────────────────────────────────────────────

const DIRECT_HTTP_METHODS: Record<string, string[]> = {
  GetMapping: ["GET"],
  PostMapping: ["POST"],
  PutMapping: ["PUT"],
  DeleteMapping: ["DELETE"],
  PatchMapping: ["PATCH"],
};

const REQUEST_METHOD_MAP: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  head: "HEAD",
  options: "OPTIONS",
};

// ─── Annotation helpers ───────────────────────────────────────────────────────

function annotationName(node: TSNode): string {
  return node.children.find((c) => c.type === "identifier")?.text ?? "";
}

function argList(node: TSNode): TSNode | undefined {
  return node.children.find((c) => c.type === "annotation_argument_list");
}

function stringsFromNode(node: TSNode): string[] {
  return node.children
    .filter((c) => c.type === "string_literal")
    .map((c) => c.text.slice(1, -1));
}

// Extract string paths from @Mapping("/a") or @Mapping({"/a","/b"}) or @Mapping(value="/a")
function annotationPaths(node: TSNode): string[] {
  const args = argList(node);
  if (!args) return [""];

  // Direct string literal: @Mapping("/path")
  const direct = args.children.find((c) => c.type === "string_literal");
  if (direct) return [direct.text.slice(1, -1)];

  // Direct array: @Mapping({"/a", "/b"}) — tree-sitter-java uses element_value_array_initializer
  const directArray = args.children.find(
    (c) => c.type === "array_initializer" || c.type === "element_value_array_initializer",
  );
  if (directArray) {
    const paths = stringsFromNode(directArray);
    return paths.length > 0 ? paths : [""];
  }

  // element_value_pair: value = "/path" or value = {"/a", "/b"}
  for (const child of args.children) {
    if (child.type !== "element_value_pair") continue;
    const key = child.children.find((c) => c.type === "identifier")?.text;
    if (key !== "value") continue;

    const arr = child.children.find(
      (c) => c.type === "array_initializer" || c.type === "element_value_array_initializer",
    );
    if (arr) {
      const paths = stringsFromNode(arr);
      return paths.length > 0 ? paths : [""];
    }
    const str = child.children.find((c) => c.type === "string_literal");
    if (str) return [str.text.slice(1, -1)];
  }

  return [""];
}

// Extract HTTP methods for @RequestMapping(method={...}) or shorthand annotations
function annotationHttpMethods(node: TSNode): string[] {
  const name = annotationName(node);

  if (name in DIRECT_HTTP_METHODS) return DIRECT_HTTP_METHODS[name]!;

  if (name !== "RequestMapping") return [];

  const args = argList(node);
  if (!args) return ["GET"];

  for (const child of args.children) {
    if (child.type !== "element_value_pair") continue;
    const key = child.children.find((c) => c.type === "identifier")?.text;
    if (key !== "method") continue;

    const arr = child.children.find(
      (c) => c.type === "array_initializer" || c.type === "element_value_array_initializer",
    );
    const candidates = arr ? arr.children : child.children;

    const methods: string[] = [];
    for (const c of candidates) {
      // field_access: RequestMethod.GET  or  member_reference
      if (c.type === "field_access" || c.type === "member_reference") {
        const ids = c.children.filter((cc: TSNode) => cc.type === "identifier");
        const member = ids[ids.length - 1]?.text?.toLowerCase();
        const mapped = member ? REQUEST_METHOD_MAP[member] : undefined;
        if (mapped) methods.push(mapped);
      }
    }
    return methods.length > 0 ? methods : ["GET"];
  }

  return ["GET"];
}

// Extract a named string attribute from an annotation, e.g. @Api(tags="foo")
function annotationStringAttr(node: TSNode, key: string): string | undefined {
  const args = argList(node);
  if (!args) return undefined;

  for (const child of args.children) {
    if (child.type !== "element_value_pair") continue;
    const k = child.children.find((c) => c.type === "identifier")?.text;
    if (k !== key) continue;
    const str = child.children.find((c) => c.type === "string_literal");
    return str ? str.text.slice(1, -1) : undefined;
  }

  // Shorthand single value (no key name)
  const direct = args.children.find((c) => c.type === "string_literal");
  return direct ? direct.text.slice(1, -1) : undefined;
}

// ─── Type / return type helper ────────────────────────────────────────────────

function getReturnType(methodNode: TSNode, modsNode: TSNode | undefined): string {
  for (const child of methodNode.children) {
    if (child === modsNode) continue;
    if (
      child.type === "identifier" ||
      child.type === "formal_parameters" ||
      child.type === "block" ||
      child.type === "throws" ||
      child.type === ";"
    ) continue;
    return child.text;
  }
  return "void";
}

// ─── Parameter extraction ─────────────────────────────────────────────────────

function extractParameters(formalParams: TSNode | undefined): TsParam[] {
  if (!formalParams) return [];

  const params: TsParam[] = [];
  for (const param of formalParams.children) {
    if (param.type !== "formal_parameter") continue;

    const mods = param.children.find((c) => c.type === "modifiers");
    const name = param.children.find((c) => c.type === "identifier")?.text;
    if (!name) continue;

    const typeNode = param.children.find(
      (c) => c !== mods && c.type !== "identifier" && c.type !== ";",
    );
    const type = typeNode?.text ?? "Object";

    let annotation: string | undefined;
    let required = true;

    if (mods) {
      for (const mod of mods.children) {
        if (mod.type !== "marker_annotation" && mod.type !== "annotation") continue;
        const aName = annotationName(mod);
        if (!["RequestBody", "PathVariable", "RequestParam", "ModelAttribute"].includes(aName)) continue;

        annotation = `@${aName}`;

        if (aName === "RequestParam") {
          const args = argList(mod);
          if (args) {
            for (const arg of args.children) {
              if (arg.type !== "element_value_pair") continue;
              const k = arg.children.find((c) => c.type === "identifier")?.text;
              if (k !== "required") continue;
              const val = arg.children.find(
                (c) => c.text === "false" || c.type === "false_literal" || c.type === "boolean_literal",
              );
              if (val && val.text === "false") required = false;
            }
          }
        }
        break;
      }
    }

    const tsParam: TsParam = { name, type, required };
    if (annotation !== undefined) tsParam.annotation = annotation;
    params.push(tsParam);
  }

  return params;
}

// ─── Main extraction ──────────────────────────────────────────────────────────

export function extractClasses(source: string, parser: Parser): TsClassInfo[] {
  const tree = parser.parse(source);
  if (!tree) return [];

  const results: TsClassInfo[] = [];

  const pkgNode = tree.rootNode.children.find((c) => c.type === "package_declaration");
  const packageName =
    pkgNode?.children.find((c) => c.type !== "package" && c.type !== ";")?.text ?? "";

  for (const topNode of tree.rootNode.children) {
    const isClass = topNode.type === "class_declaration";
    const isInterface = topNode.type === "interface_declaration";
    if (!isClass && !isInterface) continue;

    const mods = topNode.children.find((c) => c.type === "modifiers");
    const className = topNode.children.find((c) => c.type === "identifier")?.text ?? "Unknown";

    let kind: TsClassInfo["kind"] = "other";
    let basePath = "";
    let swaggerTag: string | undefined;

    if (mods) {
      for (const child of mods.children) {
        if (child.type !== "marker_annotation" && child.type !== "annotation") continue;
        const name = annotationName(child);
        if (name === "RestController" || name === "Controller") kind = "controller";
        else if (name === "Service" || name === "Component") kind = "service";
        else if (name === "Entity") kind = "entity";
        else if (name === "Mapper") kind = "mapper";

        if (name === "RequestMapping") basePath = annotationPaths(child)[0] ?? "";
        if (name === "Api") swaggerTag = annotationStringAttr(child, "tags");
      }
    }

    if (isInterface && kind === "other") {
      // Mapper-annotated interfaces without class-level annotation detection above
      // already handled — keep as "other" if no @Mapper found
    }

    const bodyNode = topNode.children.find(
      (c) => c.type === "class_body" || c.type === "interface_body",
    );
    const endpoints: TsEndpoint[] = [];
    const fields: TsClassInfo["fields"] = [];

    for (const member of bodyNode?.children ?? []) {
      if (member.type === "method_declaration") {
        const mMods = member.children.find((c) => c.type === "modifiers");
        const methodName = member.children.find((c) => c.type === "identifier")?.text ?? "";
        const returnType = getReturnType(member, mMods);
        const formalParams = member.children.find((c) => c.type === "formal_parameters");
        const parameters = extractParameters(formalParams);

        let swaggerSummary: string | undefined;

        if (mMods) {
          for (const mAnnot of mMods.children) {
            if (mAnnot.type !== "marker_annotation" && mAnnot.type !== "annotation") continue;
            const aName = annotationName(mAnnot);

            if (aName === "ApiOperation") {
              swaggerSummary = annotationStringAttr(mAnnot, "value");
            }

            const httpMethods = annotationHttpMethods(mAnnot);
            if (httpMethods.length === 0) continue;

            const paths = annotationPaths(mAnnot);
            for (const methodPath of paths) {
              const ep: TsEndpoint = { httpMethods, methodPath, methodName, returnType, parameters };
              if (swaggerSummary !== undefined) ep.swaggerSummary = swaggerSummary;
              endpoints.push(ep);
            }
          }
        }
      } else if (member.type === "field_declaration") {
        const mods2 = member.children.find((c) => c.type === "modifiers");
        const typeNode2 = member.children.find(
          (c) => c !== mods2 && c.type !== "variable_declarator_list" && c.type !== "variable_declarator" && c.type !== ";",
        );

        const varList = member.children.find((c) => c.type === "variable_declarator_list");
        const varDeclarator: TSNode | undefined = varList
          ? varList.children.find((c) => c.type === "variable_declarator")
          : member.children.find((c) => c.type === "variable_declarator");

        const fieldName = varDeclarator?.children.find((c) => c.type === "identifier")?.text;
        if (fieldName) fields.push({ name: fieldName, type: typeNode2?.text ?? "Object" });
      }
    }

    const info: TsClassInfo = { className, packageName, kind, basePath, endpoints, fields };
    if (swaggerTag !== undefined) info.swaggerTag = swaggerTag;
    results.push(info);
  }

  return results;
}
