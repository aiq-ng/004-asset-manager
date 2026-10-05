import { SerialImportError } from "@/features/assets/serial-import";

/**
 * The spreadsheet half of the serial import, split out and loaded on demand.
 *
 * This exists purely so that the library behind it is not reachable from the
 * register's initial client bundle. `XLSX` is about 470 KB minified, and the
 * whole reason it is behind a dynamic `import()` is so that a person registering
 * twenty monitors from a CSV never downloads it.
 *
 * That intent does not survive putting the `import("xlsx")` directly in the
 * module the register imports: the framework prefetches the target of a dynamic
 * import as soon as the page hydrates, so the library was fetched on every visit
 * to `/assets` whether or not a spreadsheet was ever chosen. Hiding it one level
 * further down means the prefetched chunk is this file — a few hundred bytes —
 * and the library itself is still only requested when an `.xlsx` is actually
 * read.
 *
 * CSV never comes through here at all; it is parsed by hand in `serial-import`.
 */
export async function readXlsxRows(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new SerialImportError("That workbook has no sheets in it.");

  // `header: 1` gives rows of cells with the heading already in row 1, which is
  // the same shape `parseDelimited` returns, so everything after this point is
  // shared. `defval` stops a sparse column reading as `undefined`.
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new SerialImportError("That workbook's first sheet could not be read.");

  return XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
    .map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
    );
}