import * as XLSX from "xlsx";

/** Reading and writing tables in every common file format, in the browser. */

export type FileFormat = "xlsx" | "xls" | "csv" | "tsv" | "json" | "ods";
export const FILE_FORMATS: Array<{ id: FileFormat; label: string; ext: string }> = [
  { id: "xlsx", label: "Excel (.xlsx)", ext: "xlsx" },
  { id: "xls", label: "Excel 97-2003 (.xls)", ext: "xls" },
  { id: "csv", label: "CSV (.csv)", ext: "csv" },
  { id: "tsv", label: "TSV (.tsv)", ext: "tsv" },
  { id: "json", label: "JSON (.json)", ext: "json" },
  { id: "ods", label: "OpenDocument (.ods)", ext: "ods" },
];
/** What the file chooser accepts. */
export const ACCEPT = ".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.txt,.json,.ods,.numbers,.html,.htm";

export interface Table { headers: string[]; rows: Array<Record<string, unknown>>; sheet?: string }

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clean = (value: unknown): unknown => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : isoOf(value);
  if (typeof value === "string") return value.trim();
  return value ?? "";
};

/** Turns rows of cells into a table: the first row with at least two filled cells is the header. */
function fromRows(grid: unknown[][], sheet?: string): Table {
  const at = grid.findIndex((row) => row.filter((cell) => String(clean(cell)).length > 0).length >= 2);
  const start = at >= 0 ? at : grid.findIndex((row) => row.some((cell) => String(clean(cell)).length > 0));
  if (start < 0) return { headers: [], rows: [], sheet };
  const seen = new Map<string, number>();
  const headers = grid[start].map((cell, i) => {
    const base = String(clean(cell)) || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1; seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
  const rows = grid.slice(start + 1)
    .filter((cells) => cells.some((cell) => String(clean(cell)).length > 0))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, clean(cells[i])])));
  return { headers, rows, sheet };
}

function fromJson(text: string): Table {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^﻿/, "")); } catch { throw new Error("That JSON file could not be read. Check that it is valid JSON."); }
  // Accept a list, or an object that holds the list under any key (for example { "data": [...] } or { "recipients": [...] }).
  let list: unknown = data;
  if (!Array.isArray(list) && list && typeof list === "object") list = Object.values(list as Record<string, unknown>).find(Array.isArray);
  if (!Array.isArray(list) || !list.length) throw new Error("That JSON file has no rows. It should hold a list of records.");
  if (Array.isArray(list[0])) return fromRows(list as unknown[][]);
  const flat = (value: unknown): unknown => (value && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value);
  const headers: string[] = [];
  for (const item of list) for (const key of Object.keys((item ?? {}) as object)) if (!headers.includes(key)) headers.push(key);
  return { headers, rows: list.map((item) => Object.fromEntries(headers.map((h) => [h, clean(flat((item as Record<string, unknown>)?.[h]))]))) };
}

/** Reads a spreadsheet or data file (xlsx, xls, ods, csv, tsv, txt, json, html, numbers) into headers and rows. */
export async function readTable(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) return fromJson(await file.text());
  const plain = /\.(csv|tsv|txt)$/.test(name);
  const book = plain ? XLSX.read(await file.text(), { type: "string", cellDates: true, raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  // The first sheet that has data.
  for (const sheetName of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false });
    const table = fromRows(grid, sheetName);
    if (table.headers.length) return table;
  }
  throw new Error("That file has no rows. Use the template as a starting point.");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves a table as a file in the chosen format. `rows` are lists of cells in the same order as `headers`. */
export function writeTable(headers: string[], rows: unknown[][], format: FileFormat, baseName: string) {
  const ext = FILE_FORMATS.find((f) => f.id === format)?.ext ?? format;
  const filename = `${baseName}.${ext}`;
  if (format === "json") {
    const records = rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
    return download(new Blob([JSON.stringify(records, null, 2)], { type: "application/json;charset=utf-8" }), filename);
  }
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2) }));
  if (format === "csv" || format === "tsv") {
    const text = XLSX.utils.sheet_to_csv(sheet, { FS: format === "tsv" ? "\t" : "," });
    return download(new Blob(["﻿" + text], { type: `text/${format === "tsv" ? "tab-separated-values" : "csv"};charset=utf-8` }), filename);
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Recipients");
  const bookType = format === "xls" ? "biff8" : format;
  const out = XLSX.write(book, { bookType, type: "array" }) as ArrayBuffer;
  download(new Blob([out], { type: "application/octet-stream" }), filename);
}
