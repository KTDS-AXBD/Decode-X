// Minimal SourceAnalysisResult shape mirrored from @ai-foundry/types
// (avoids monorepo import complexity in standalone CLI)
export interface SourceAnalysisResult {
  projectName: string;
  controllers: Array<{
    className: string;
    packageName: string;
    basePath: string;
    endpoints: Array<{
      httpMethod: string[];
      path: string;
      methodName: string;
      parameters: Array<{ name: string; type: string; required: boolean }>;
      returnType: string;
    }>;
    sourceFile: string;
  }>;
  dataModels: Array<{
    className: string;
    packageName: string;
    modelType: string;
    fields: Array<{ name: string; type: string; nullable: boolean }>;
    sourceFile: string;
  }>;
  transactions: Array<{
    className: string;
    methodName: string;
    parameters: Array<{ name: string; type: string; required: boolean }>;
    returnType: string;
    isTransactional: boolean;
    readOnly: boolean;
    sourceFile: string;
    lineNumber: number;
  }>;
  ddlTables: unknown[];
  stats: {
    totalFiles: number;
    javaFiles: number;
    sqlFiles: number;
    controllerCount: number;
    endpointCount: number;
    dataModelCount: number;
    transactionCount: number;
    ddlTableCount: number;
    mapperCount: number;
  };
}
