import { describe, test, expect } from "vitest";
import { parseDdl } from "../parsing/ddl.js";

describe("DDL parser", () => {
  test("basic CREATE TABLE with columns", () => {
    const sql = `
CREATE TABLE payment_history (
  id BIGINT NOT NULL PRIMARY KEY,
  order_id VARCHAR(50) NOT NULL,
  amount DECIMAL(18,2) DEFAULT 0,
  memo VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
    `;
    const result = parseDdl(sql, "schema.sql");
    expect(result).toHaveLength(1);

    const table = result[0]!;
    expect(table.tableName).toBe("payment_history");
    expect(table.sourceFile).toBe("schema.sql");
    expect(table.columns.length).toBeGreaterThanOrEqual(4);

    const idCol = table.columns.find((c) => c.name === "id");
    expect(idCol).toBeDefined();
    expect(idCol!.type).toBe("BIGINT");
    expect(idCol!.nullable).toBe(false);
    expect(idCol!.isPrimaryKey).toBe(true);

    const memoCol = table.columns.find((c) => c.name === "memo");
    expect(memoCol!.nullable).toBe(true);
  });

  test("multiple tables in one file", () => {
    const sql = `
CREATE TABLE users (
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100),
  PRIMARY KEY (user_id)
);

CREATE TABLE orders (
  order_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  total BIGINT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
    `;
    const result = parseDdl(sql, "init.sql");
    expect(result).toHaveLength(2);

    expect(result[0]!.tableName).toBe("users");
    expect(result[0]!.primaryKey).toContain("user_id");

    expect(result[1]!.tableName).toBe("orders");
    expect(result[1]!.foreignKeys).toHaveLength(1);
    expect(result[1]!.foreignKeys[0]!.column).toBe("user_id");
    expect(result[1]!.foreignKeys[0]!.refTable).toBe("users");
    expect(result[1]!.foreignKeys[0]!.refColumn).toBe("user_id");
  });

  test("CREATE TABLE IF NOT EXISTS", () => {
    const sql = `
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(100) NOT NULL,
  value TEXT,
  PRIMARY KEY (key)
);
    `;
    const result = parseDdl(sql, "config.sql");
    expect(result).toHaveLength(1);
    expect(result[0]!.tableName).toBe("config");
  });

  test("COMMENT on columns", () => {
    const sql = `
CREATE TABLE account (
  account_no VARCHAR(20) NOT NULL COMMENT '계좌번호',
  balance BIGINT DEFAULT 0 COMMENT '잔액',
  PRIMARY KEY (account_no)
);
    `;
    const result = parseDdl(sql, "account.sql");
    expect(result).toHaveLength(1);

    const accCol = result[0]!.columns.find((c) => c.name === "account_no");
    expect(accCol!.comment).toBe("계좌번호");
  });

  test("empty result for non-DDL SQL", () => {
    const sql = `
SELECT * FROM users WHERE id = 1;
INSERT INTO users (name) VALUES ('test');
    `;
    expect(parseDdl(sql, "queries.sql")).toHaveLength(0);
  });

  test("backtick-quoted identifiers", () => {
    const sql = `
CREATE TABLE \`order_items\` (
  \`item_id\` BIGINT NOT NULL,
  \`order_id\` VARCHAR(36),
  \`quantity\` INT DEFAULT 1,
  PRIMARY KEY (\`item_id\`)
);
    `;
    const result = parseDdl(sql, "items.sql");
    expect(result).toHaveLength(1);
    expect(result[0]!.tableName).toBe("order_items");
    expect(result[0]!.columns[0]!.name).toBe("item_id");
  });
});
