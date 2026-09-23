// Renders the group summary (see buildGroupSummary) as a PDF with jsPDF.
// The PDF always uses light colors, whatever theme the app is in.
import type { GroupSummary } from "./export";
import { themeColors } from "./theme";

// Geist (the app font, SIL OFL) embedded so €, £ and accented names render;
// jsPDF's built-in fonts only cover Latin-1.
const FONT_FILES = {
  normal: "/fonts/Geist-Regular.ttf",
  bold: "/fonts/Geist-Bold.ttf",
} as const;
const FONT_NAME = "Geist";

const PAGE_MARGIN = 15;
const LIGHT = themeColors.light;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFont(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load font ${url} (${response.status})`);
  }
  return arrayBufferToBase64(await response.arrayBuffer());
}

export async function buildSummaryPdf(summary: GroupSummary): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, regular, bold] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadFont(FONT_FILES.normal),
    loadFont(FONT_FILES.bold),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Geist-Regular.ttf", regular);
  doc.addFont("Geist-Regular.ttf", FONT_NAME, "normal");
  doc.addFileToVFS("Geist-Bold.ttf", bold);
  doc.addFont("Geist-Bold.ttf", FONT_NAME, "bold");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN + 5;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const heading = (text: string) => {
    ensureSpace(10);
    y += 3;
    doc.setFont(FONT_NAME, "bold").setFontSize(12).setTextColor(LIGHT.text);
    doc.text(text, PAGE_MARGIN, y);
    y += 6;
  };

  const lines = (items: string[]) => {
    doc.setFont(FONT_NAME, "normal").setFontSize(10).setTextColor(LIGHT.text);
    for (const item of items) {
      const wrapped: string[] = doc.splitTextToSize(item, contentWidth);
      ensureSpace(wrapped.length * 5);
      doc.text(wrapped, PAGE_MARGIN, y);
      y += wrapped.length * 5;
    }
  };

  doc.setFont(FONT_NAME, "bold").setFontSize(18).setTextColor(LIGHT.text);
  const title: string[] = doc.splitTextToSize(summary.title, contentWidth);
  doc.text(title, PAGE_MARGIN, y);
  y += title.length * 8;

  doc.setFont(FONT_NAME, "normal").setFontSize(10).setTextColor(LIGHT.textMuted);
  doc.text(`Currency: ${summary.currency}   ·   Generated on ${summary.generatedOn}`, PAGE_MARGIN, y);
  y += 6;

  heading("Your balance");
  lines(summary.yourBalance);
  heading("All balances (Detailed)");
  lines(summary.detailed);
  heading("All balances (Simplified)");
  lines(summary.simplified);
  heading("Expenses");

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [summary.expenseColumns],
    body: summary.expenseRows,
    styles: { font: FONT_NAME, fontSize: 9, textColor: LIGHT.text },
    headStyles: { fontStyle: "bold", fillColor: LIGHT.primary, textColor: LIGHT.onPrimary },
    alternateRowStyles: { fillColor: LIGHT.surfaceHover },
    columnStyles: { 3: { halign: "right" } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  doc.setFont(FONT_NAME, "normal").setFontSize(9).setTextColor(LIGHT.textMuted);
  ensureSpace(6);
  doc.text(summary.reconciliationNote, PAGE_MARGIN, y);
  y += 3;

  heading("Settlements");
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [summary.settlementColumns],
    body: summary.settlementRows,
    styles: { font: FONT_NAME, fontSize: 9, textColor: LIGHT.text },
    headStyles: { fontStyle: "bold", fillColor: LIGHT.primary, textColor: LIGHT.onPrimary },
    alternateRowStyles: { fillColor: LIGHT.surfaceHover },
    columnStyles: { 3: { halign: "right" } },
  });

  return doc.output("blob");
}
