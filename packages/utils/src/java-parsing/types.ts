export interface Annotation {
  name: string;
  path: string;
  methods?: string[];
}

export interface ParamInfo {
  name: string;
  type: string;
  required: boolean;
  annotation?: string;
}

export interface Endpoint {
  httpMethods: string[];
  methodPath: string;
  fullPath: string;
  methodName: string;
  returnType: string;
  parameters: ParamInfo[];
  lineNumber?: number;
  swaggerSummary?: string;
}

export interface FieldInfo {
  name: string;
  type: string;
}

export interface ClassInfo {
  className: string;
  packageName: string;
  kind: "controller" | "service" | "entity" | "mapper" | "other";
  basePath: string;
  swaggerTag?: string;
  endpoints: Endpoint[];
  fields: FieldInfo[];
}
