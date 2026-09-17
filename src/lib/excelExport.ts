/**
 * Zero-dependency Excel-compatible export.
 *
 * Generates SpreadsheetML 2003 XML, which Excel can open natively. This is
 * intentionally not an XLSX writer: no third-party package is required and
 * the implementation stays small and auditable.
 *
 * Production guarantees:
 * - XML-safe escaping for worksheet names, headers, and cell values.
 * - Valid Excel worksheet-name constraints.
 * - Correct numeric serialization, including finite-number validation.
 * - Dates/booleans/nulls are exported safely as strings unless explicitly
 *   represented by a finite number.
 * - Rectangularizes short/long rows against the header count.
 * - Sanitizes the download filename.
 * - Works with browsers that require the anchor to be attached to the DOM.
 * - Revokes object URLs after the browser has had a chance to start download.
 * - Throws clear errors for invalid export arguments instead of producing a
 *   corrupt document.
 */

const MAX_SHEET_NAME_LENGTH = 31;
const DEFAULT_SHEET_NAME = 'Sheet1';
const DEFAULT_FILENAME = 'export.xls';

const INVALID_SHEET_NAME_RE = /[:\\/?*\[\]]/g;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*\u0000-\u001F]/g;

type ExcelCell = string | number | null | undefined;

/**
 * `document.createElement('a')` returns an HTMLAnchorElement, and the download
 * path below uses `.style`, `appendChild` and `.remove` on it. A hand-written
 * three-property interface described a narrower thing than the code actually
 * needs, so those three calls did not compile.
 */
type DownloadAnchor = HTMLAnchorElement;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(CONTROL_CHAR_RE, '');
}

function normalizeSheetName(value: string): string {
  const candidate = String(value ?? '')
    .replace(CONTROL_CHAR_RE, '')
    .replace(INVALID_SHEET_NAME_RE, '')
    .trim();

  return (candidate || DEFAULT_SHEET_NAME).slice(0, MAX_SHEET_NAME_LENGTH);
}

function normalizeFilename(value: string): string {
  const candidate = String(value ?? '')
    .replace(INVALID_FILENAME_CHARS_RE, '_')
    .replace(/\s+/g, ' ')
    .trim();

  const safe = candidate || DEFAULT_FILENAME;

  return /\.xls$/i.test(safe) ? safe : `${safe}.xls`;
}

function assertExportArguments(
  headers: readonly string[],
  rows: readonly ExcelCell[][],
): void {
  if (!Array.isArray(headers)) {
    throw new TypeError('Excel export headers must be an array.');
  }

  if (!Array.isArray(rows)) {
    throw new TypeError('Excel export rows must be an array.');
  }

  for (const header of headers) {
    if (typeof header !== 'string') {
      throw new TypeError('Excel export headers must contain strings only.');
    }
  }

  for (const row of rows) {
    if (!Array.isArray(row)) {
      throw new TypeError('Each Excel export row must be an array.');
    }
  }
}

function cellXml(cell: ExcelCell): string {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<Cell><Data ss:Type="Number">${escapeXml(
      Object.is(cell, -0) ? 0 : cell,
    )}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
}

function rowXml(
  row: readonly ExcelCell[],
  columnCount: number,
): string {
  const cells = Array.from(
    { length: columnCount },
    (_, index) => cellXml(row[index]),
  );

  return `<Row>${cells.join('')}</Row>`;
}

function buildSpreadsheetXml(
  sheetName: string,
  headers: readonly string[],
  rows: readonly ExcelCell[][],
): string {
  const safeSheetName = normalizeSheetName(sheetName);
  const headerRow = rowXml(headers, headers.length);

  const dataRows = rows
    .map((row) => rowXml(row, headers.length))
    .join('');

  /**
   * XML is emitted without user-controlled attributes other than the escaped
   * worksheet name. Cell content remains text/number data, not executable
   * markup.
   */
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook',
    ' xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `<Worksheet ss:Name="${escapeXml(safeSheetName)}">`,
    '<Table>',
    headerRow,
    dataRows,
    '</Table>',
    '</Worksheet>',
    '</Workbook>',
  ].join('');
}

function triggerDownload(
  blob: Blob,
  filename: string,
): void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error(
      'Excel export requires a browser environment with Blob URL support.',
    );
  }

  const url = URL.createObjectURL(blob);
  let anchor: DownloadAnchor | null = null;

  try {
    anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor) {
      anchor.remove();
    }

    /**
     * Give the browser the current task to initiate the download before
     * releasing the object URL. setTimeout also avoids leaking the URL when
     * the click throws.
     */
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/**
 * Build and download an Excel-compatible SpreadsheetML 2003 workbook.
 *
 * @param filename  Download filename; `.xls` is appended when absent.
 * @param sheetName Worksheet title; Excel's 31-character/name restrictions
 *                  are normalized automatically.
 * @param headers   Column headers.
 * @param rows      Data rows. Values are exported as strings except finite
 *                  JavaScript numbers, which become Excel Number cells.
 */
export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: readonly string[],
  rows: readonly ExcelCell[][],
): void {
  assertExportArguments(headers, rows);

  const safeFilename = normalizeFilename(filename);
  const safeSheetName = normalizeSheetName(sheetName);
  const xml = buildSpreadsheetXml(
    safeSheetName,
    headers,
    rows,
  );

  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel',
  });

  triggerDownload(blob, safeFilename);
}

/**
 * Exported for deterministic unit tests without triggering a browser download.
 */
export function createExcelSpreadsheetXml(
  sheetName: string,
  headers: readonly string[],
  rows: readonly ExcelCell[][],
): string {
  assertExportArguments(headers, rows);

  return buildSpreadsheetXml(
    normalizeSheetName(sheetName),
    headers,
    rows,
  );
}
