export { extractClasses } from "./extractor.js";
export { getJavaParser, initJavaParserNode, isJavaParserReady, setParser } from "./loader.js";
export type { ClassInfo, Endpoint, FieldInfo, Annotation, ParamInfo } from "./types.js";
// loader-workers.ts is NOT re-exported here — Workers code imports it directly via
// "@ai-foundry/utils/java-parsing/loader-workers" to avoid Vitest WASM import errors
