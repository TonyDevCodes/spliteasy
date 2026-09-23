// Writes export files to the cache directory and opens the system share sheet.
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { GroupSummary } from "./export";
import { themeColors } from "./theme";

// A4 in points (72 per inch).
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

function freshCacheFile(fileName: string): File {
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  return file;
}

async function share(uri: string, mimeType: string, UTI: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle });
}

export async function shareCsv(csv: string, fileName: string): Promise<void> {
  const file = freshCacheFile(fileName);
  file.create();
  file.write(csv);
  await share(file.uri, "text/csv", "public.comma-separated-values-text", fileName);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The PDF always uses the light palette, whatever theme the app is in. */
export function summaryToHtml(summary: GroupSummary): string {
  const c = themeColors.light;
  const list = (items: string[]) => items.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
  const table = (columns: string[], rows: string[][]) =>
    `<table><thead><tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 40px; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: ${c.text}; background: ${c.surface}; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  p { margin: 2px 0; }
  .meta, .note { color: ${c.textMuted}; }
  .note { font-size: 11px; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: ${c.primary}; color: ${c.onPrimary}; text-align: left; padding: 6px; }
  td { padding: 6px; border-bottom: 1px solid ${c.border}; }
  tr:nth-child(even) td { background: ${c.surfaceHover}; }
  th:last-child, td:last-child { text-align: right; }
</style>
</head>
<body>
  <h1>${escapeHtml(summary.title)}</h1>
  <p class="meta">Currency: ${escapeHtml(summary.currency)} &nbsp;·&nbsp; Generated on ${escapeHtml(summary.generatedOn)}</p>
  <h2>Your balance</h2>
  ${list(summary.yourBalance)}
  <h2>All balances (Detailed)</h2>
  ${list(summary.detailed)}
  <h2>All balances (Simplified)</h2>
  ${list(summary.simplified)}
  <h2>Expenses</h2>
  ${table(summary.expenseColumns, summary.expenseRows)}
  <p class="note">${escapeHtml(summary.reconciliationNote)}</p>
  <h2>Settlements</h2>
  ${table(summary.settlementColumns, summary.settlementRows)}
</body>
</html>`;
}

export async function sharePdf(summary: GroupSummary, fileName: string): Promise<void> {
  const { base64 } = await Print.printToFileAsync({
    html: summaryToHtml(summary),
    width: A4_WIDTH,
    height: A4_HEIGHT,
    base64: true,
  });
  if (!base64) {
    throw new Error("PDF generation returned no data.");
  }
  // Write the PDF under a readable name. The file expo-print creates cannot be
  // moved or read with the File API in every environment (e.g. Expo Go), so
  // its content is taken from the base64 result instead.
  const target = freshCacheFile(fileName);
  target.create();
  target.write(base64, { encoding: "base64" });
  await share(target.uri, "application/pdf", "com.adobe.pdf", fileName);
}
