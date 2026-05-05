import type { Parser } from "web-tree-sitter";
import type { Node as TSNode } from "web-tree-sitter";
import type { ClassInfo, Endpoint, FieldInfo, Annotation, ParamInfo } from "./types.js";

const HTTP_METHOD_MAP: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
  RequestMapping: "GET",
};

const REQUEST_METHOD_MAP: Record<string, string> = {
  "requestmethod.get": "GET",
  "requestmethod.post": "POST",
  "requestmethod.put": "PUT",
  "requestmethod.delete": "DELETE",
  "requestmethod.patch": "PATCH",
  "requestmethod.head": "HEAD",
  "requestmethod.options": "OPTIONS",
};

function annotationName(node: TSNode): string {
  return node.children.find((c) => c.type === "identifier")?.text ?? "";
}

function extractAnnotationPaths(argsNode: TSNode | undefined): string[] {
  if (!argsNode) return [""];

  // Case 1: @Mapping("/path") — direct string literal
  const directStr = argsNode.children.find((c) => c.type === "string_literal");
  if (directStr) return [directStr.text.slice(1, -1)];

  // Case 2: @Mapping(value = "/path") — element_value_pair
  const pair = argsNode.children.find((c) => c.type === "element_value_pair");
  if (pair) {
    const key = pair.children.find((c) => c.type === "identifier")?.text;
    if (!key || key === "value") {
      const pairStr = pair.children.find((c) => c.type === "string_literal");
      if (pairStr) return [pairStr.text.slice(1, -1)];

      // Case 3: @PostMapping({"/a", "/b"}) — element_value_array_initializer
      const arrayInit = pair.children.find((c) => c.type === "element_value_array_initializer");
      if (arrayInit) {
        return arrayInit.children
          .filter((c) => c.type === "string_literal")
          .map((c) => c.text.slice(1, -1));
      }
    }
  }

  // Case 4: direct array (no value=) — {"/a", "/b"}
  const arrayInit = argsNode.children.find((c) => c.type === "element_value_array_initializer");
  if (arrayInit) {
    return arrayInit.children
      .filter((c) => c.type === "string_literal")
      .map((c) => c.text.slice(1, -1));
  }

  return [""];
}

function extractAnnotationMethods(argsNode: TSNode | undefined): string[] {
  if (!argsNode) return [];
  for (const child of argsNode.children) {
    if (child.type !== "element_value_pair") continue;
    const key = child.children.find((c) => c.type === "identifier")?.text;
    if (key !== "method") continue;
    const arrayInit = child.children.find((c) => c.type === "element_value_array_initializer");
    const items = arrayInit?.children ?? child.children;
    return items
      .filter((c) => c.type === "field_access" || c.type === "identifier")
      .map((c) => REQUEST_METHOD_MAP[c.text.toLowerCase()] ?? "")
      .filter(Boolean);
  }
  return [];
}

function parseAnnotation(node: TSNode): Annotation {
  const name = annotationName(node);
  const argsNode = node.children.find((c) => c.type === "annotation_argument_list");
  const paths = extractAnnotationPaths(argsNode);
  const methods = name === "RequestMapping" ? extractAnnotationMethods(argsNode) : [];
  return { name, path: paths[0] ?? "", methods };
}

function getAnnotationPaths(node: TSNode): string[] {
  const argsNode = node.children.find((c) => c.type === "annotation_argument_list");
  return extractAnnotationPaths(argsNode);
}

function extractModifiers(mods: TSNode | undefined): Annotation[] {
  if (!mods) return [];
  return mods.children
    .filter((c) => c.type === "marker_annotation" || c.type === "annotation")
    .map(parseAnnotation);
}

function getReturnType(methodNode: TSNode, modsNode: TSNode | undefined): string {
  const typeNode = methodNode.children.find(
    (c) =>
      c !== modsNode &&
      c.type !== "identifier" &&
      c.type !== "formal_parameters" &&
      c.type !== "block" &&
      c.type !== "throws" &&
      c.type !== ";" &&
      !["public", "private", "protected", "static", "final", "void"].includes(c.type),
  );
  return typeNode?.text ?? "void";
}

const PARAM_ANNOTATIONS = new Set(["RequestBody", "PathVariable", "RequestParam", "ModelAttribute"]);

function extractParameters(formalParams: TSNode | undefined): ParamInfo[] {
  if (!formalParams) return [];
  const params: ParamInfo[] = [];
  for (const param of formalParams.children) {
    if (param.type !== "formal_parameter") continue;
    const mods = param.children.find((c) => c.type === "modifiers");
    const paramAnnotations = mods ? extractModifiers(mods) : [];
    const nameNode = param.children.filter((c) => c.type === "identifier").pop();
    if (!nameNode) continue;
    const name = nameNode.text;

    const typeNodes = param.children.filter(
      (c) => c !== mods && c.type !== "identifier" && c.type !== "variable_declarator",
    );
    const type = typeNodes[0]?.text ?? "Object";

    const paramAnnot = paramAnnotations.find((a) => PARAM_ANNOTATIONS.has(a.name));
    let required = true;
    if (paramAnnot?.name === "RequestParam") {
      // required=false if annotation arg contains "required" with "false"
      const annotNode = mods?.children.find(
        (c) => (c.type === "annotation" || c.type === "marker_annotation") && annotationName(c) === "RequestParam",
      );
      const argsNode = annotNode?.children.find((c) => c.type === "annotation_argument_list");
      if (argsNode) {
        const reqPair = argsNode.children.find(
          (c) =>
            c.type === "element_value_pair" &&
            c.children.find((k) => k.type === "identifier")?.text === "required",
        );
        if (reqPair) {
          const val = reqPair.children.find((c) => c.type === "false")?.text ?? "";
          required = val !== "false";
        }
      }
    }

    params.push({
      name,
      type,
      required,
      ...(paramAnnot ? { annotation: `@${paramAnnot.name}` } : {}),
    });
  }
  return params;
}

function extractFieldInfo(fieldNode: TSNode): FieldInfo | null {
  const varList = fieldNode.children.find((c) => c.type === "variable_declarator_list");
  const varDeclarator =
    varList?.children.find((c) => c.type === "variable_declarator") ??
    fieldNode.children.find((c) => c.type === "variable_declarator");
  const fieldName = varDeclarator?.children.find((c) => c.type === "identifier")?.text;
  if (!fieldName) return null;
  const typeNode = fieldNode.children.find(
    (c) =>
      c.type !== "modifiers" &&
      c.type !== "variable_declarator_list" &&
      c.type !== "variable_declarator" &&
      c.type !== ";",
  );
  return { name: fieldName, type: typeNode?.text ?? "Object" };
}

export function extractClasses(source: string, parser: Parser): ClassInfo[] {
  const tree = parser.parse(source);
  if (!tree) return [];

  const results: ClassInfo[] = [];
  const pkgNode = tree.rootNode.children.find((c) => c.type === "package_declaration");
  const packageName =
    pkgNode?.children.find((c) => c.type !== "package" && c.type !== ";")?.text ?? "";

  for (const topNode of tree.rootNode.children) {
    const isClass = topNode.type === "class_declaration";
    const isInterface = topNode.type === "interface_declaration";
    if (!isClass && !isInterface) continue;

    const mods = topNode.children.find((c) => c.type === "modifiers");
    const annotations = extractModifiers(mods);
    const className =
      topNode.children.find((c) => c.type === "identifier")?.text ?? "Unknown";

    let kind: ClassInfo["kind"] = "other";
    let basePath = "";
    let swaggerTag: string | undefined;

    for (const annot of annotations) {
      if (annot.name === "RestController" || annot.name === "Controller") kind = "controller";
      else if (annot.name === "Service" || annot.name === "Component") kind = "service";
      else if (annot.name === "Entity") kind = "entity";
      else if (annot.name === "Mapper") kind = "mapper";
      if (annot.name === "RequestMapping") basePath = annot.path;
      if (annot.name === "Api") {
        const argsNode = topNode.children
          .find((c) => c.type === "modifiers")
          ?.children.find((c) => c.type === "annotation" && annotationName(c) === "Api")
          ?.children.find((c) => c.type === "annotation_argument_list");
        const tagPair = argsNode?.children.find(
          (c) =>
            c.type === "element_value_pair" &&
            c.children.find((k) => k.type === "identifier")?.text === "tags",
        );
        const tagStr = tagPair?.children.find((c) => c.type === "string_literal");
        swaggerTag = tagStr ? tagStr.text.slice(1, -1) : undefined;
      }
    }
    if (isInterface && kind === "other" && annotations.some((a) => a.name === "Mapper")) {
      kind = "mapper";
    }

    const bodyNode = topNode.children.find(
      (c) => c.type === "class_body" || c.type === "interface_body",
    );
    const endpoints: Endpoint[] = [];
    const fields: FieldInfo[] = [];

    for (const member of bodyNode?.children ?? []) {
      if (member.type === "method_declaration" || member.type === "interface_method_declaration") {
        const mMods = member.children.find((c) => c.type === "modifiers");
        const mAnnotations = extractModifiers(mMods);
        const methodName =
          member.children.find((c) => c.type === "identifier")?.text ?? "";
        const returnType = getReturnType(member, mMods);
        const formalParams = member.children.find((c) => c.type === "formal_parameters");
        const parameters = extractParameters(formalParams);
        const lineNumber = member.startPosition?.row ? member.startPosition.row + 1 : undefined;

        let swaggerSummary: string | undefined;
        for (const mAnnot of mAnnotations) {
          if (mAnnot.name === "ApiOperation") {
            const aNode = mMods?.children.find(
              (c) => c.type === "annotation" && annotationName(c) === "ApiOperation",
            );
            const argsN = aNode?.children.find((c) => c.type === "annotation_argument_list");
            const str =
              argsN?.children.find((c) => c.type === "string_literal") ??
              argsN?.children
                .find((c) => c.type === "element_value_pair")
                ?.children.find((c) => c.type === "string_literal");
            swaggerSummary = str ? str.text.slice(1, -1) : undefined;
          }
        }

        for (const mAnnot of mAnnotations) {
          const httpMethod = HTTP_METHOD_MAP[mAnnot.name];
          if (httpMethod !== undefined) {
            let httpMethods: string[];
            let methodPaths: string[];

            if (mAnnot.name === "RequestMapping") {
              // Extract explicit method= array
              const annotNode = mMods?.children.find(
                (c) => c.type === "annotation" && annotationName(c) === "RequestMapping",
              );
              const argsNode = annotNode?.children.find(
                (c) => c.type === "annotation_argument_list",
              );
              const explicitMethods = extractAnnotationMethods(argsNode);
              httpMethods = explicitMethods.length > 0 ? explicitMethods : ["GET"];
              methodPaths = annotNode ? getAnnotationPaths(annotNode) : [mAnnot.path];
            } else {
              httpMethods = [httpMethod];
              const annotNode = mMods?.children.find(
                (c) => c.type === "annotation" && annotationName(c) === mAnnot.name,
              );
              methodPaths = annotNode ? getAnnotationPaths(annotNode) : [mAnnot.path];
            }

            for (const methodPath of methodPaths) {
              const normalizedPath = methodPath.startsWith("/") ? methodPath : `/${methodPath}`;
              endpoints.push({
                httpMethods,
                methodPath: normalizedPath,
                fullPath: basePath + normalizedPath,
                methodName,
                returnType,
                parameters,
                ...(lineNumber !== undefined ? { lineNumber } : {}),
                ...(swaggerSummary !== undefined ? { swaggerSummary } : {}),
              });
            }
          }
        }
      } else if (member.type === "field_declaration") {
        const f = extractFieldInfo(member);
        if (f) fields.push(f);
      }
    }

    results.push({ className, packageName, kind, basePath, ...(swaggerTag !== undefined ? { swaggerTag } : {}), endpoints, fields });
  }

  return results;
}
