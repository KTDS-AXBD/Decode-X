export interface TsParam {
  name: string;
  type: string;
  required: boolean;
  annotation?: string;
}

export interface TsEndpoint {
  httpMethods: string[];
  methodPath: string;
  methodName: string;
  returnType: string;
  swaggerSummary?: string;
  parameters: TsParam[];
}

export interface TsClassInfo {
  className: string;
  packageName: string;
  kind: "controller" | "service" | "entity" | "mapper" | "other";
  basePath: string;
  swaggerTag?: string;
  endpoints: TsEndpoint[];
  fields: Array<{ name: string; type: string }>;
}
