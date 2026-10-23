// Excel 写出：基于 exceljs（MIT）。加粗表头、冻结首行、长文字列自动换行，「意向」按高中低着色。
import ExcelJS from 'exceljs';

const INTENT_FILL: Record<string, string> = { 高: 'FFFDE2E1', 中: 'FFFEF3C7', 低: 'FFE5E7EB' };

export async function writeXlsx(sheet: string, header: string[], rows: string[][], widths: number[] = []): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '篝火 · 聊天截图转客户档案';
  const ws = wb.addWorksheet(sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => {
    c.width = widths[i] ?? 14;
    if ((widths[i] ?? 0) >= 24) c.alignment = { wrapText: true, vertical: 'top' };
  });
  const intentCol = header.indexOf('意向') + 1;
  if (intentCol > 0) {
    ws.getColumn(intentCol).eachCell((cell, n) => {
      const color = n > 1 ? INTENT_FILL[String(cell.value)] : undefined;
      if (color) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 读回第一个工作表（测试用） */
export async function readFirstSheet(bytes: Uint8Array): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const out: unknown[][] = [];
  wb.worksheets[0].eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
}
