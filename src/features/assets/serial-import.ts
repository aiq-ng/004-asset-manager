import { BULK_ASSET_ENTRY_MAX } from "@/lib/validators/asset";

/**
 * Reads serial numbers out of a spreadsheet somebody else made.
 *
 * The register is one kind of item at a time: a batch decides the type, name,
 * brand and model once, and this only ever supplies the serials. That is a
 * deliberate limit rather than an omission — asset ids are allocated per type
 * from a per-type counter, so a file mixing laptops and monitors is not one
 * batch and cannot be one request.
 *
 * Everything here runs in the browser. A list of twenty serial numbers is not
 * worth a round trip or a server-side upload, and parsing here means the parsed
 * values land straight in the serial column where the operator can read them,
 * correct them and submit them through the form that already exists — same
 * dedupe, same skip reasons, same draft, same labels afterwards.
 */

/** Extensions we will try to read, as advertised by the file picker's `accept`. */
export const SERIAL_FILE_EXTENSIONS = ["csv", "tsv", "xlsx", "xls"] as const;

/**
 * Ceiling on the uploaded file, applied before anything is parsed.
 *
 * Generous next to the 500-row cap, because an XLSX is a ZIP of XML and a
 * spreadsheet with a lot of formatting in columns nobody reads can be large
 * while holding a dozen serials. Reading it is bounded by memory, not by the
 * row limit, so the byte limit is what stops a mis-picked file.
 */
export const SERIAL_FILE_MAX_BYTES = 5 * 1024 * 1024;

export interface SerialImportResult {
  /** Trimmed, non-empty, in file order. Deduplicated within the file. */
  serials: string[];
  /** Rows dropped and why, so the count on screen can be reconciled. */
  skipped: { row: number; reason: string }[];
  /** True when the file had more usable serials than one batch may hold. */
  truncated: boolean;
}

export class SerialImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerialImportError";
  }
}

/**
 * Cell values that are obviously a column heading rather than a serial.
 *
 * Every spreadsheet has one, and it sits in row 1 where the first real serial
 * belongs. Without this the heading is registered as an asset with the serial
 * number "Serial Number", which is worse than useless: it consumes an asset id
 * and looks like a success on the summary.
 *
 * Narrow on purpose. This is not header detection and it does not choose a
 * column — a file whose first cell genuinely reads "Serial" as a value is a
 * file nobody has.
 */
const HEADING_CELLS = new Set([
  "serial",
  "serial no",
  "serial no.",
  "serial number",
  "serial numbers",
  "serial #",
  "sn",
  "s/n",
  "asset serial",
  "asset tag",
  "tag",
]);

function looksLikeHeading(value: string): boolean {
  return HEADING_CELLS.has(value.trim().toLowerCase().replace(/\s+/g, " "));
}

/**
 * RFC 4180 CSV, hand-rolled.
 *
 * `XLSX` can read CSV too, but it is a large library and CSV is the format most
 * likely to be pasted together quickly or exported by a scanner, so the common
 * case should not pay for the heavy one. This handles what Excel and
 * `scanner-to-csv` tools actually emit: quoted fields, commas and newlines
 * inside quotes, doubled quotes as an escape, CRLF, and a UTF-8 BOM.
 *
 * Returns rows of cells. Only the first column is ever read by the caller.
 */
export function parseDelimited(text: string): string[][] {
  // A BOM survives a UTF-8 round trip through some exporters and would
  // otherwise become part of the first cell's first character.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      endCell();
      index += 1;
      continue;
    }
    // Tolerates both LF and CRLF: a trailing \r would otherwise end up inside
    // the next cell and stop every serial matching.
    if (char === "\r") {
      if (input[index + 1] === "\n") index += 1;
      endRow();
      index += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      index += 1;
      continue;
    }

    cell += char;
    index += 1;
  }

  // A file that does not end in a newline still has a last row.
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

/** First non-empty cell of each row, which is the only column read. */
function firstColumn(rows: string[][]): string[] {
  return rows.map((row) => (row.length > 0 ? (row[0] ?? "") : ""));
}

async function readXlsxRowsFrom(file: File): Promise<string[][]> {
  // One level deeper than it looks like it needs to be. See the note in
  // `serial-import-xlsx`: the framework prefetches the target of a dynamic
  // import on page load, so importing the library from here would have pulled
  // it onto every visit to the register. Behind the wrapper, only the wrapper is
  // prefetched and the library is fetched when a spreadsheet is really read.
  const { readXlsxRows } = await import("@/features/assets/serial-import-xlsx");
  return readXlsxRows(file);
}

/**
 * Reads a picked file into the serials it contains.
 *
 * @throws {SerialImportError} with something the operator can act on — a
 * message they can read beats an opaque parser failure.
 */
export async function readSerialsFromFile(file: File): Promise<SerialImportResult> {
  if (file.size > SERIAL_FILE_MAX_BYTES) {
    throw new SerialImportError(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${SERIAL_FILE_MAX_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isSpreadsheet = extension === "xlsx" || extension === "xls";

  let rows: string[][];
  try {
    rows = isSpreadsheet
      ? await readXlsxRowsFrom(file)
      : parseDelimited(await file.text());
  } catch (error) {
    if (error instanceof SerialImportError) throw error;
    // The library's own failures are not written for an operator, and a corrupt
    // file is the likeliest cause by a distance.
    throw new SerialImportError("That file could not be read. Check it opens in Excel first.");
  }

  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  const serials: string[] = [];
  let truncated = false;

  firstColumn(rows).forEach((raw, index) => {
    const value = raw.trim();

    if (index === 0 && looksLikeHeading(value)) {
      skipped.push({ row: 1, reason: "Looked like a column heading" });
      return;
    }
    if (value === "") return;

    // Case-insensitive: a serial read off a barcode scanner and the same serial
    // typed by hand are the same serial, and the register's uniqueness check is
    // case-sensitive, so folding here is what stops the second one failing with
    // "already on the register" for no reason anybody can see.
    const key = value.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ row: index + 1, reason: "Repeated in this file" });
      return;
    }

    if (serials.length >= BULK_ASSET_ENTRY_MAX) {
      truncated = true;
      return;
    }

    seen.add(key);
    serials.push(value);
  });

  if (serials.length === 0) {
    throw new SerialImportError(
      "No serial numbers found in the first column of that file.",
    );
  }

  return { serials, skipped, truncated };
}