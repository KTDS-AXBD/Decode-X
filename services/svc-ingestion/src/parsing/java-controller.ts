import type { CodeController, CodeEndpoint, HttpMethod } from "@ai-foundry/types";
import { getJavaParser, extractClasses } from "@ai-foundry/utils/java-parsing";

const HTTP_METHOD_TO_TYPED: Record<string, HttpMethod> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
};

// Fallback for isController() when parser not yet initialized (early startup)
const RE_CONTROLLER_FALLBACK = /@(?:Rest)?Controller\b/;

export function isController(content: string): boolean {
  try {
    const parser = getJavaParser();
    const classes = extractClasses(content, parser);
    return classes.some((c) => c.kind === "controller");
  } catch {
    return RE_CONTROLLER_FALLBACK.test(content);
  }
}

export function parseJavaController(source: string, filename: string): CodeController | null {
  const parser = getJavaParser();
  const classes = extractClasses(source, parser);
  const controller = classes.find((c) => c.kind === "controller");
  if (!controller) return null;

  const endpoints: CodeEndpoint[] = controller.endpoints.map((ep) => ({
    httpMethod: ep.httpMethods
      .map((m) => HTTP_METHOD_TO_TYPED[m])
      .filter((m): m is HttpMethod => m !== undefined),
    path: ep.methodPath,
    methodName: ep.methodName,
    parameters: ep.parameters.map((p) => ({
      name: p.name,
      type: p.type,
      required: p.required,
      annotation: p.annotation,
    })),
    returnType: ep.returnType,
    swaggerSummary: ep.swaggerSummary,
    lineNumber: ep.lineNumber,
  }));

  return {
    className: controller.className,
    packageName: controller.packageName,
    basePath: controller.basePath,
    swaggerTag: controller.swaggerTag,
    endpoints,
    sourceFile: filename,
  };
}
