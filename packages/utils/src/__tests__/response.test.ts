/**
 * Tests for @ai-foundry/utils response helpers.
 * Verifies HTTP response status, body structure, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { ok, created, noContent, notFound, unauthorized, forbidden, badRequest, err, errFromUnknown } from "../response.js";
import { AppError } from "../errors.js";

interface ApiOk<T> {
  success: true;
  data: T;
}

interface ApiErr {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

// ── ok() ─────────────────────────────────────────────────────────

describe("ok", () => {
  it("returns 200 with { success: true, data }", async () => {
    const res = ok({ message: "hello" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json() as ApiOk<{ message: string }>;
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("hello");
  });

  it("supports custom status code", async () => {
    const res = ok("accepted", 202);
    expect(res.status).toBe(202);
    const body = await res.json() as ApiOk<string>;
    expect(body.data).toBe("accepted");
  });

  it("handles null data", async () => {
    const res = ok(null);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<null>;
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it("handles array data", async () => {
    const res = ok([1, 2, 3]);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<number[]>;
    expect(body.data).toEqual([1, 2, 3]);
  });
});

// ── created() ────────────────────────────────────────────────────

describe("created", () => {
  it("returns 201 with { success: true, data }", async () => {
    const res = created({ id: "new-1" });
    expect(res.status).toBe(201);
    const body = await res.json() as ApiOk<{ id: string }>;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-1");
  });
});

// ── noContent() ──────────────────────────────────────────────────

describe("noContent", () => {
  it("returns 204 with null body", () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});

// ── notFound() ───────────────────────────────────────────────────

describe("notFound", () => {
  it("returns 404 with NOT_FOUND code and resource message", async () => {
    const res = notFound("document");
    expect(res.status).toBe(404);
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("document not found");
  });

  it("includes id in message when provided", async () => {
    const res = notFound("document", "doc-123");
    expect(res.status).toBe(404);
    const body = await res.json() as ApiErr;
    expect(body.error.message).toBe("document 'doc-123' not found");
  });
});

// ── unauthorized() ───────────────────────────────────────────────

describe("unauthorized", () => {
  it("returns 401 with default message", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
  });

  it("returns 401 with custom message", async () => {
    const res = unauthorized("Missing token");
    expect(res.status).toBe(401);
    const body = await res.json() as ApiErr;
    expect(body.error.message).toBe("Missing token");
  });
});

// ── forbidden() ──────────────────────────────────────────────────

describe("forbidden", () => {
  it("returns 403 with default message", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 403 with custom message", async () => {
    const res = forbidden("Insufficient role");
    expect(res.status).toBe(403);
    const body = await res.json() as ApiErr;
    expect(body.error.message).toBe("Insufficient role");
  });
});

// ── badRequest() ─────────────────────────────────────────────────

describe("badRequest", () => {
  it("returns 400 with VALIDATION_ERROR code", async () => {
    const res = badRequest("Invalid input");
    expect(res.status).toBe(400);
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid input");
  });

  it("includes details when provided", async () => {
    const details = { field: "email", reason: "invalid format" };
    const res = badRequest("Validation failed", details);
    expect(res.status).toBe(400);
    const body = await res.json() as ApiErr;
    expect(body.error.details).toEqual(details);
  });
});

// ── err() ────────────────────────────────────────────────────────

describe("err", () => {
  it("returns custom status with error body", async () => {
    const res = err({ code: "CUSTOM_ERROR", message: "Something went wrong" }, 422);
    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CUSTOM_ERROR");
  });

  it("defaults to 500 status", async () => {
    const res = err({ code: "INTERNAL_ERROR", message: "fail" });
    expect(res.status).toBe(500);
  });
});

// ── errFromUnknown() ─────────────────────────────────────────────

describe("errFromUnknown", () => {
  it("returns 500 for a plain Error", async () => {
    const res = errFromUnknown(new Error("test error"));
    expect(res.status).toBe(500);
    const body = await res.json() as ApiErr;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("test error");
  });

  it("returns 500 with generic message for non-Error values", async () => {
    const res = errFromUnknown("string error");
    expect(res.status).toBe(500);
    const body = await res.json() as ApiErr;
    expect(body.error.message).toBe("Internal server error");
  });

  it("maps AppError to its statusCode and code", async () => {
    const appErr = new AppError("CUSTOM_CODE", "custom message", 409);
    const res = errFromUnknown(appErr);
    expect(res.status).toBe(409);
    const body = await res.json() as ApiErr;
    expect(body.error.code).toBe("CUSTOM_CODE");
    expect(body.error.message).toBe("custom message");
  });

  it("preserves AppError details", async () => {
    const appErr = new AppError("VALIDATION_ERROR", "bad input", 400, { field: "name" });
    const res = errFromUnknown(appErr);
    expect(res.status).toBe(400);
    const body = await res.json() as ApiErr;
    expect(body.error.details).toEqual({ field: "name" });
  });

  it("handles null/undefined gracefully", async () => {
    const res = errFromUnknown(null);
    expect(res.status).toBe(500);
    const body = await res.json() as ApiErr;
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
