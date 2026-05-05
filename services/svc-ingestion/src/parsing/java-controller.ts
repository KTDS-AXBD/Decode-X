import type { CodeController, CodeEndpoint, CodeParam, HttpMethod } from "@ai-foundry/types";
import { getJavaParser, extractClasses } from "@ai-foundry/utils/java-parsing";

export function isController(content: string): boolean {
  try {
    const parser = getJavaParser();
    const classes = extractClasses(content, parser);
    return classes.some((c) => c.kind === "controller");
  } catch {
    return /[@](?:RestController|Controller)\b/.test(content);
  }
}

export function parseJavaController(source: string, filename: string): CodeController | null {
  const parser = getJavaParser();
  const classes = extractClasses(source, parser);

  const ctrl = classes.find((c) => c.kind === "controller");
  if (!ctrl) return null;

  const endpoints: CodeEndpoint[] = ctrl.endpoints.map((ep) => {
    const params: CodeParam[] = ep.parameters.map((p) => {
      const param: CodeParam = {
        name: p.name,
        type: p.type,
        required: p.required,
      };
      if (p.annotation !== undefined) param.annotation = p.annotation;
      return param;
    });

    const ep2: CodeEndpoint = {
      httpMethod: ep.httpMethods.map((m) => m as HttpMethod),
      path: ep.methodPath.startsWith("/") ? ep.methodPath : `/${ep.methodPath}`,
      methodName: ep.methodName,
      parameters: params,
      returnType: ep.returnType,
    };
    if (ep.swaggerSummary !== undefined) ep2.swaggerSummary = ep.swaggerSummary;
    return ep2;
  });

  const result: CodeController = {
    className: ctrl.className,
    packageName: ctrl.packageName,
    basePath: ctrl.basePath,
    endpoints,
    sourceFile: filename,
  };
  if (ctrl.swaggerTag !== undefined) result.swaggerTag = ctrl.swaggerTag;
  return result;
}
