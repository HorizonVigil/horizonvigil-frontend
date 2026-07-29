/**
 * Real Excel export with zero dependencies: builds a SpreadsheetML 2003 XML
 * document (Microsoft's documented, plain-XML Excel format — not a binary
 * .xlsx, but a real file Excel opens natively via File > Open, same trick
 * Excel itself has supported since Office 2003). No npm package was added
 * for this since installing one sight-unseen (can't verify a package
 * actually exists/the right version from this environment) risked repeating
 * this project's own documented history of fabricated-package mistakes —
 * this needs nothing but string building.
 */
function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function downloadExcel(filename: string, sheetName: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const headerRow = `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`;
  const dataRows = rows
    .map((row) => `<Row>${row.map((cell) => {
      const isNumber = typeof cell === 'number';
      return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${escapeXml(cell)}</Data></Cell>`;
    }).join('')}</Row>`)
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeXml(sheetName).slice(0, 31)}">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
