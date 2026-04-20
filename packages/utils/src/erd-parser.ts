export interface ErdColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  check?: string;
  comment?: string;
}

export interface ErdIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ErdEntity {
  name: string;
  columns: ErdColumn[];
  indexes: ErdIndex[];
  compositePk?: string[];
}

export interface ErdRelation {
  name: string;
  from: string;
  fromColumn: string;
  to: string;
  toColumn: string;
  type: "MANY_TO_ONE";
}

export interface ErdParseResult {
  entities: ErdEntity[];
  relations: ErdRelation[];
  warnings: string[];
}

// Split DDL into individual SQL statements (semicolon-delimited)
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let current = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;

    if (inString) {
      current += ch;
      if (ch === stringChar && sql[i - 1] !== "\\") inString = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }

    if (ch === "(") depth++;
    else if (ch === ")") depth--;

    if (ch === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) statements.push(last);

  return statements;
}

// Extract trailing inline comment (-- text) from a token string
function extractComment(text: string): { clean: string; comment?: string } {
  const idx = text.indexOf("--");
  if (idx === -1) return { clean: text.trim() };
  const c = text.slice(idx + 2).trim();
  return {
    clean: text.slice(0, idx).trim(),
    ...(c ? { comment: c } : {}),
  };
}

// Capture the content inside balanced parentheses starting at pos
// Returns [content, endPos]
function captureParens(text: string, start: number): [string, number] {
  let depth = 0;
  let result = "";
  let i = start;
  let inString = false;
  let stringChar = "";

  for (; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      result += ch;
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }

    if (ch === "(") {
      depth++;
      if (depth === 1) continue; // skip outer open paren
      result += ch;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return [result, i];
      result += ch;
    } else {
      result += ch;
    }
  }
  return [result, i];
}

// Parse a single column/constraint definition line
function parseColumnDef(
  line: string,
  tableName: string
): ErdColumn | { fk: ErdRelation } | { compositePk: string[] } | null {
  const { clean, comment } = extractComment(line);
  const upper = clean.toUpperCase().trimStart();

  // FOREIGN KEY (<col>) REFERENCES <table>(<col>)
  if (upper.startsWith("FOREIGN KEY")) {
    const fkMatch = clean.match(
      /FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i
    );
    if (fkMatch) {
      const [, fromCol, toTable, toCol] = fkMatch;
      return {
        fk: {
          name: `fk_${tableName}_${fromCol!}`,
          from: tableName,
          fromColumn: fromCol!,
          to: toTable!,
          toColumn: toCol!,
          type: "MANY_TO_ONE",
        },
      };
    }
    return null;
  }

  // PRIMARY KEY (<col1>, <col2>)
  if (upper.startsWith("PRIMARY KEY")) {
    const pkMatch = clean.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
      const cols = pkMatch[1]!.split(",").map((c) => c.trim());
      return { compositePk: cols };
    }
    return null;
  }

  // UNIQUE (<col>) — table-level unique constraint
  if (upper.startsWith("UNIQUE") && upper.includes("(")) {
    return null; // handled separately if needed; skip for now
  }

  // CHECK constraint at table level (starts with CHECK)
  if (upper.startsWith("CHECK")) {
    return null;
  }

  // Column definition: <name> <type> [modifiers...]
  const colMatch = clean.match(/^(\w+)\s+([\w]+(?:\s*\([^)]*\))?)\s*(.*)/s);
  if (!colMatch) return null;

  const [, name, type, rest] = colMatch;
  if (!name || !type) return null;

  // Skip SQL keywords that aren't column names
  const keywords = new Set([
    "CONSTRAINT",
    "KEY",
    "INDEX",
    "UNIQUE",
    "CHECK",
    "PRIMARY",
    "FOREIGN",
  ]);
  if (keywords.has(name.toUpperCase())) return null;

  const col: ErdColumn = {
    name,
    type: type.toUpperCase(),
    notNull: false,
    primaryKey: false,
    unique: false,
  };

  if (comment) col.comment = comment;

  let remaining = rest ?? "";

  // NOT NULL
  if (/NOT\s+NULL/i.test(remaining)) {
    col.notNull = true;
    remaining = remaining.replace(/NOT\s+NULL/i, "").trim();
  }

  // PRIMARY KEY
  if (/PRIMARY\s+KEY/i.test(remaining)) {
    col.primaryKey = true;
    col.notNull = true;
    remaining = remaining.replace(/PRIMARY\s+KEY/i, "").trim();
  }

  // UNIQUE
  if (/\bUNIQUE\b/i.test(remaining)) {
    col.unique = true;
    remaining = remaining.replace(/\bUNIQUE\b/i, "").trim();
  }

  // DEFAULT value
  const defMatch = remaining.match(/DEFAULT\s+(\S+)/i);
  if (defMatch) {
    col.defaultValue = defMatch[1]!.replace(/[()]/g, "");
    remaining = remaining.replace(/DEFAULT\s+\S+/i, "").trim();
  }

  // CHECK(...)
  const checkIdx = remaining.search(/\bCHECK\b/i);
  if (checkIdx !== -1) {
    const openParen = remaining.indexOf("(", checkIdx);
    if (openParen !== -1) {
      const [checkContent] = captureParens(remaining, openParen);
      col.check = checkContent;
    }
  }

  return col;
}

// Move "col TYPE,  -- comment" → "col TYPE -- comment," so comments stay with their column
function normalizeBodyComments(body: string): string {
  return body.replace(/,(\s*)(--[^\n]*)/g, " $2,");
}

// Strip leading -- line comments from a statement before classification
function stripLeadingComments(stmt: string): string {
  const lines = stmt.split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = (lines[i] ?? "").trim();
    if (t === "" || t.startsWith("--")) i++;
    else break;
  }
  return lines.slice(i).join("\n");
}

// Parse CREATE TABLE statement
function parseCreateTable(
  stmt: string,
  entities: ErdEntity[],
  relations: ErdRelation[],
  warnings: string[]
): void {
  const nameMatch = stmt.match(/CREATE\s+TABLE\s+(\w+)\s*\(/i);
  if (!nameMatch) {
    warnings.push(`Could not parse table name from: ${stmt.slice(0, 60)}`);
    return;
  }

  const tableName = nameMatch[1]!;
  // Use the match position to find the exact opening paren, not the first ( in the stmt
  const parenStart = (nameMatch.index ?? 0) + nameMatch[0].length - 1;
  const [body] = captureParens(stmt, parenStart);

  const entity: ErdEntity = { name: tableName, columns: [], indexes: [] };

  // Normalize: move trailing "-- comment" before its preceding comma
  const defs = splitByTopLevelComma(normalizeBodyComments(body));

  for (const def of defs) {
    const trimmed = def.trim();
    if (!trimmed) continue;

    const result = parseColumnDef(trimmed, tableName);
    if (!result) continue;

    if ("fk" in result) {
      relations.push(result.fk);
    } else if ("compositePk" in result) {
      entity.compositePk = result.compositePk;
    } else {
      entity.columns.push(result);
    }
  }

  entities.push(entity);
}

// Split by commas at depth 0
function splitByTopLevelComma(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let current = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }

    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

// Parse CREATE [UNIQUE] INDEX statement
function parseCreateIndex(
  stmt: string,
  entities: ErdEntity[],
  warnings: string[]
): void {
  const match = stmt.match(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/i
  );
  if (!match) {
    warnings.push(`Could not parse index: ${stmt.slice(0, 60)}`);
    return;
  }

  const [, unique, idxName, tableName, colList] = match;
  const entity = entities.find((e) => e.name === tableName);
  if (!entity) {
    warnings.push(`Index references unknown table: ${tableName}`);
    return;
  }

  entity.indexes.push({
    name: idxName!,
    columns: colList!.split(",").map((c) => c.trim()),
    unique: !!unique,
  });
}

export function parseErd(sql: string): ErdParseResult {
  const entities: ErdEntity[] = [];
  const relations: ErdRelation[] = [];
  const warnings: string[] = [];

  const statements = splitStatements(sql);

  for (const stmt of statements) {
    // Strip leading -- comments before classification (the first CREATE TABLE may have file-header comments)
    const effective = stripLeadingComments(stmt);
    const upper = effective.toUpperCase().trimStart();

    if (upper.startsWith("CREATE TABLE")) {
      parseCreateTable(effective, entities, relations, warnings);
    } else if (upper.startsWith("CREATE UNIQUE INDEX") || upper.startsWith("CREATE INDEX")) {
      parseCreateIndex(effective, entities, warnings);
    } else if (upper.startsWith("ALTER TABLE")) {
      warnings.push(`ALTER TABLE not yet supported: ${effective.slice(0, 60)}`);
    }
    // Other statements (CREATE VIEW, INSERT, etc.) are silently skipped
  }

  return { entities, relations, warnings };
}
