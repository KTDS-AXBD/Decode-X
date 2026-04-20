import { describe, expect, it } from "vitest";
import { parseErd } from "./erd-parser.js";

// Representative subset of LPON DDL (17 tables, 22 FK relations in production)
// Using inline DDL to avoid node:fs dependency in Workers-typed package
const LPON_DDL = `
-- LPON 온누리상품권 데이터 모델
-- Auto-extracted from 02-data-model.md

CREATE TABLE users (
  id TEXT PRIMARY KEY,                                         -- UUID
  name TEXT NOT NULL,                                          -- 사용자명
  phone TEXT NOT NULL,                                         -- 연락처 (SMS 발송용)
  email TEXT,                                                  -- 이메일
  role TEXT NOT NULL CHECK(role IN ('USER','MERCHANT','ADMIN')), -- 역할
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','WITHDRAWN','SUSPENDED')), -- 상태
  sms_opt_in INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE vouchers (
  id TEXT PRIMARY KEY,                                         -- UUID
  user_id TEXT NOT NULL,                                       -- 소유자
  face_amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','USED','EXPIRED','REFUNDED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_vouchers_user ON vouchers(user_id);

CREATE TABLE charge_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('REQUESTED','CHARGED','CANCELED','FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_number TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','SUSPENDED','TERMINATED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX idx_merchants_owner ON merchants(owner_user_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PAID','CANCELED')),
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);

CREATE TABLE cancel_transactions (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  cancel_amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('REQUESTED','COMPLETED','FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

CREATE TABLE refund_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  requested_amount INTEGER NOT NULL,
  deposit_amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('REQUESTED','COMPLETED','FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);
`;

describe("parseErd — LPON DDL (인라인 대표 케이스)", () => {
  const result = parseErd(LPON_DDL);

  it("KPI: 테이블 ≥ 5개 추출", () => {
    expect(result.entities.length).toBeGreaterThanOrEqual(5);
  });

  it("KPI: 관계 ≥ 10개 추출", () => {
    expect(result.relations.length).toBeGreaterThanOrEqual(10);
  });

  it("users 테이블 존재 + PK 컬럼 포함", () => {
    const users = result.entities.find((e) => e.name === "users");
    expect(users).toBeDefined();
    const pk = users!.columns.find((c) => c.primaryKey);
    expect(pk).toBeDefined();
    expect(pk!.name).toBe("id");
  });

  it("vouchers → users FK 존재", () => {
    const fk = result.relations.find(
      (r) => r.from === "vouchers" && r.to === "users"
    );
    expect(fk).toBeDefined();
    expect(fk!.fromColumn).toBe("user_id");
    expect(fk!.toColumn).toBe("id");
    expect(fk!.type).toBe("MANY_TO_ONE");
  });

  it("payments → merchants FK 존재", () => {
    const fk = result.relations.find(
      (r) => r.from === "payments" && r.to === "merchants"
    );
    expect(fk).toBeDefined();
  });

  it("인라인 한글 주석 추출", () => {
    const users = result.entities.find((e) => e.name === "users");
    const idCol = users!.columns.find((c) => c.name === "id");
    expect(idCol!.comment).toBe("UUID");
  });

  it("NOT NULL 속성 파싱", () => {
    const users = result.entities.find((e) => e.name === "users");
    const nameCol = users!.columns.find((c) => c.name === "name");
    expect(nameCol!.notNull).toBe(true);
  });

  it("파싱 경고 없음 (DDL 전체 커버)", () => {
    const criticalWarnings = result.warnings.filter(
      (w) => !w.startsWith("ALTER TABLE")
    );
    expect(criticalWarnings).toHaveLength(0);
  });

  it("indexes 추출 (CREATE INDEX)", () => {
    const users = result.entities.find((e) => e.name === "users");
    expect(users!.indexes.length).toBeGreaterThan(0);
  });

  it("charge_transactions 다중 FK (users + vouchers)", () => {
    const fks = result.relations.filter((r) => r.from === "charge_transactions");
    expect(fks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseErd — 엣지케이스", () => {
  it("빈 DDL → 빈 결과", () => {
    const r = parseErd("");
    expect(r.entities).toHaveLength(0);
    expect(r.relations).toHaveLength(0);
  });

  it("CHECK 중첩 괄호 파싱", () => {
    const ddl = `
      CREATE TABLE t1 (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('A','B','C')) -- 역할
      );
    `;
    const r = parseErd(ddl);
    expect(r.entities).toHaveLength(1);
    const roleCol = r.entities[0]!.columns.find((c) => c.name === "role");
    expect(roleCol).toBeDefined();
    expect(roleCol!.check).toContain("'A'");
  });

  it("composite PK 파싱", () => {
    const ddl = `
      CREATE TABLE t2 (
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        PRIMARY KEY (a, b)
      );
    `;
    const r = parseErd(ddl);
    expect(r.entities[0]!.compositePk).toEqual(["a", "b"]);
  });

  it("DEFAULT 값 파싱", () => {
    const ddl = `
      CREATE TABLE t3 (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `;
    const r = parseErd(ddl);
    const col = r.entities[0]!.columns.find((c) => c.name === "created_at");
    expect(col!.defaultValue).toBeDefined();
  });

  it("다중 테이블 + FK 체인", () => {
    const ddl = `
      CREATE TABLE parent (id TEXT PRIMARY KEY);
      CREATE TABLE child (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent(id)
      );
    `;
    const r = parseErd(ddl);
    expect(r.entities).toHaveLength(2);
    expect(r.relations).toHaveLength(1);
    expect(r.relations[0]!.from).toBe("child");
    expect(r.relations[0]!.to).toBe("parent");
  });
});
