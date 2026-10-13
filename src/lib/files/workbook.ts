// Spreadsheet input (.xlsx, .xls, .xlsm, .ods). The workbook is read in the
// browser with SheetJS and each sheet is turned into CSV text, which then
// goes through the same path as a delimited text file. SheetJS is bundled
// with the site and loaded only when a spreadsheet is chosen.

export const SPREADSHEET = /\.(xlsx|xls|xlsm|ods)$/i

export function isSpreadsheet(name: string): boolean {
  return SPREADSHEET.test(name)
}

export interface SheetText {
  name: string
  /** The sheet as comma-delimited text. */
  text: string
}

/** True when CSV text has at least one cell with a value. */
function hasValues(csv: string): boolean {
  return /[^,"\s]/.test(csv)
}

/**
 * Read a workbook and return its non-empty sheets as CSV text, in workbook
 * order. Cell values are the formatted text shown in the spreadsheet, so
 * dates and percents read the way they look.
 */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<SheetText[]> {
  const XLSX = await import('xlsx')
  let wb: import('xlsx').WorkBook
  try {
    wb = XLSX.read(data, { type: 'array', dense: true })
  } catch {
    throw new Error('This spreadsheet could not be opened. It may be password protected or damaged. Try saving it again, or export as CSV.')
  }
  const sheets: SheetText[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const text = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n', blankrows: false })
    if (hasValues(text)) sheets.push({ name, text })
  }
  return sheets
}
