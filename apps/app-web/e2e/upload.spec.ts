// TODO(S224/TD-41): DEMO_USERS 폐기(F389)로 loginAs("김경임") 불가 + /upload protected route. 재활성화 S224.
import { test, expect } from "@playwright/test";

// Minimal valid PDF (1 page, blank)
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
  "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n" +
  "0000000058 00000 n \n0000000115 00000 n \n" +
  "trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
);

const TEST_FILENAME = "e2e-test-upload.pdf";
const BASE_URL = "http://localhost:5173";
const DEFAULT_HEADERS = {
  "X-Organization-Id": "Miraeasset",
  "X-User-Id": "analyst-001",
};

/** Delete test documents via Playwright APIRequestContext (outside browser, no test timeout pressure) */
async function cleanupTestDocuments(request: import("@playwright/test").APIRequestContext) {
  try {
    const res = await request.get(`${BASE_URL}/api/documents`, { headers: DEFAULT_HEADERS });
    if (!res.ok()) return;
    const data = await res.json() as {
      success: boolean;
      data: { documents: { document_id: string; original_name: string }[] };
    };
    if (!data.success) return;
    const testDocs = data.data.documents.filter((d) => d.original_name === TEST_FILENAME);
    await Promise.all(
      testDocs.map((doc) =>
        request.delete(`${BASE_URL}/api/documents/${doc.document_id}`, { headers: DEFAULT_HEADERS }),
      ),
    );
  } catch {
    // best-effort cleanup
  }
}

test.describe.skip("File upload E2E", () => {
  test("upload a PDF as Analyst and verify it appears in the list", async ({ browser, request }) => {
    // Pre-cleanup: remove leftover test docs from previous failed runs
    await cleanupTestDocuments(request);

    // Login as Analyst (has document:upload permission)
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByText("김경임").click(); // analyst-001
    await expect(page).toHaveURL("/");

    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /문서 업로드/ })).toBeVisible();

    // Set file on the hidden input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: TEST_FILENAME,
      mimeType: "application/pdf",
      buffer: MINIMAL_PDF,
    });
    await fileInput.dispatchEvent("change");

    // Wait for upload network request to complete
    const uploadResponse = await page.waitForResponse(
      (resp) => resp.url().includes("/api/documents") && resp.request().method() === "POST",
      { timeout: 30_000 },
    ).catch(() => null);

    expect(uploadResponse).not.toBeNull();
    expect(uploadResponse!.status()).toBe(201);

    // Verify the file appears in the document list (use heading to avoid toast text)
    await expect(
      page.getByRole("heading", { name: TEST_FILENAME }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await ctx.close();

    // Post-cleanup via APIRequestContext (runs outside browser, independent of test timeout)
    await cleanupTestDocuments(request);
  });

  test("rejects unsupported file type", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /문서 업로드/ })).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("fake"),
    });

    await expect(page.getByText(/지원하지 않는 파일 형식/)).toBeVisible({ timeout: 5_000 });
  });
});
