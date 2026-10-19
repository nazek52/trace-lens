import { test, expect } from "@playwright/test";
test("explores synthetic trace, filters errors, and inspects self time", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Follow the latency." }),
  ).toBeVisible();
  await expect(page.locator(".span-row")).toHaveCount(13);
  await page.getByLabel("Errors only").check();
  await expect(page.locator(".span-row")).toHaveCount(1);
  await page.locator(".span-row").click();
  await expect(
    page.getByRole("complementary", { name: "Span details" }),
  ).toContainText("ERROR");
  await page.getByLabel("Errors only").uncheck();
  await page.getByLabel("Search spans").fill("missing-operation");
  await expect(page.getByText("No matching spans")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".span-row")).toHaveCount(13);
});
test("imports OTLP through the worker and preserves current data on invalid import", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Import trace JSON");
  const data = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "worker-service" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                spanId: "one",
                traceId: "otlp",
                name: "OTLP operation",
                startTimeUnixNano: "1700000000000000000",
                endTimeUnixNano: "1700000000001000000",
              },
            ],
          },
        ],
      },
    ],
  };
  await input.setInputFiles({
    name: "otlp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator(".span-row")).toHaveCount(1);
  await expect(page.locator(".span-row")).toContainText("OTLP operation");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByRole("status")).toContainText("Import failed");
  await expect(page.locator(".span-row")).toContainText("OTLP operation");
});
test("exports a re-importable trace without network upload", async ({
  page,
}) => {
  let outbound = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") outbound++;
  });
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export trace" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("trace-lens-export.json");
  await page
    .getByLabel("Import trace JSON")
    .setInputFiles((await download.path())!);
  await expect(page.locator(".span-row")).toHaveCount(13);
  expect(outbound).toBe(0);
});
test("mobile layout stays inside the viewport and controls are keyboard reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Import trace JSON" }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("desktop preview has no runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".span-row")).toHaveCount(13);
  await page.screenshot({ path: "docs/preview.png", fullPage: true });
  expect(errors).toEqual([]);
});
