import { Transaction, TransactionType } from "../types";
type FieldKey =
  | "ignore"
  | "amount"
  | "direction"
  | "description"
  | "date"
  | "type";
type Direction = "i_paid" | "they_paid";
type CsvRow = Record<string, string>;

interface ParsedRow {
  rowNumber: number;
  amount: number | null;
  direction: Direction | null;
  description: string;
  date: Date;
  type: TransactionType | null;
  errors: string[];
  fingerprint: string | null;
  duplicate: boolean;
}

interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  rejected: number;
  failed?: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const BATCH_SIZE = 400;

const FIELD_OPTIONS: Array<{
  value: FieldKey;
  label: string;
  required?: boolean;
}> = [
  { value: "ignore", label: "— Ignore —" },
  { value: "amount", label: "Amount", required: true },
  { value: "direction", label: "Balance effect (who owes)" },
  { value: "description", label: "Description" },
  { value: "date", label: "Date" },
  { value: "type", label: "Type (payment/request)" },
];

const HEADER_HEURISTICS: Array<{ expression: RegExp; field: FieldKey }> = [
  {
    expression: /^(amount|amt|total|sum|value|price|cost|paid)$/i,
    field: "amount",
  },
  {
    expression:
      /^(direction|paid by|payer|who paid|side|flow|balance effect|who owes|owed by)$/i,
    field: "direction",
  },
  {
    expression: /^(description|desc|note|notes|memo|details|reason|for)$/i,
    field: "description",
  },
  {
    expression: /^(date|when|event date|tx date|transaction date|created at)$/i,
    field: "date",
  },
  { expression: /^(type|kind|category|transaction type)$/i, field: "type" },
];

function autoMap(headers: string[]): Record<string, FieldKey> {
  const used = new Set<FieldKey>();
  return Object.fromEntries(
    headers.map((header) => {
      const match = HEADER_HEURISTICS.find(
        ({ expression, field }) =>
          expression.test(header.trim()) && !used.has(field),
      );
      if (match) used.add(match.field);
      return [header, match?.field ?? "ignore"];
    }),
  );
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAtNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function parseDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  let date: Date | null = null;
  if (iso) {
    date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  } else if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    // Slash dates are interpreted as month/day/year, matching the app's US locale.
    date = new Date(year, Number(slash[1]) - 1, Number(slash[2]), 12);
  } else {
    const parsed = new Date(text);
    date = Number.isNaN(parsed.getTime()) ? null : dateAtNoon(parsed);
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1900 || date.getFullYear() > 2100) return null;
  return date;
}

function parseAmount(value: string): {
  amount: number | null;
  negative: boolean;
} {
  const raw = value.trim();
  if (!raw) return { amount: null, negative: false };
  const negative = raw.includes("-") || /^\(.*\)$/.test(raw);
  let numeric = raw.replace(/[()\sA-Za-z$£€¥₹₩₽₺₪]/g, "").replace(/-/g, "");
  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    const decimal = comma > dot ? "," : ".";
    numeric =
      decimal === ","
        ? numeric.replace(/\./g, "").replace(",", ".")
        : numeric.replace(/,/g, "");
  } else if (comma !== -1 && /^\d{1,3}(,\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/,/g, "");
  } else if (comma !== -1) {
    numeric = numeric.replace(",", ".");
  }
  const amount = Number(numeric);
  return {
    amount: Number.isFinite(amount) ? Math.abs(amount) : null,
    negative,
  };
}

function parseDirection(value: string): Direction | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  // "i_paid" means the other person owes the importer; "they_paid" means
  // the importer owes the other person. Accept the old paid/request wording
  // as well as direct, unambiguous balance wording.
  if (
    /^(i|me|myself|you|outgoing|payment|paid|i paid|paid by me|debit|they owe|they owe me|partner owes|partner owes me|owed to me|they requested)$/.test(
      normalized,
    )
  )
    return "i_paid";
  if (
    /^(they|them|partner|other|incoming|request|received|they paid|paid to me|credit|i owe|i owe them|i requested)$/.test(
      normalized,
    )
  )
    return "they_paid";
  return null;
}

function parseType(value: string): TransactionType | null {
  const normalized = value.trim().toLowerCase();
  if (
    [
      "payment",
      "paid",
      "expense",
      "i paid",
      "they owe",
      "they owe me",
      "they requested",
    ].includes(normalized)
  )
    return "payment";
  if (
    [
      "request",
      "requested",
      "receive",
      "received",
      "they paid",
      "i owe",
      "i owe them",
      "i requested",
    ].includes(normalized)
  )
    return "request";
  if (["adjustment", "adjust"].includes(normalized)) return "adjustment";
  return null;
}

function normaliseDescription(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function fingerprintFor(
  row: Pick<ParsedRow, "amount" | "type" | "description" | "date">,
): string | null {
  if (row.amount === null || !row.type) return null;
  const cents = Math.round(row.amount * 100);
  return [
    "v1",
    formatDateKey(row.date),
    row.type,
    cents,
    normaliseDescription(row.description).toLowerCase(),
  ].join("|");
}

function stableId(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
    second = Math.imul(
      second ^ value.charCodeAt(value.length - 1 - index),
      0x01000193,
    );
  }
  return `import_${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function existingFingerprint(transaction: Transaction): string | null {
  if (transaction.importFingerprint) return transaction.importFingerprint;
  const timestamp = transaction.date?.toDate
    ? transaction.date.toDate()
    : transaction.createdAt?.toDate?.();
  if (!timestamp) return null;
  return fingerprintFor({
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description ?? "",
    date: timestamp,
  });
}

export {
  formatDateKey,
  autoMap,
  parseDate,
  parseAmount,
  parseDirection,
  parseType,
  normaliseDescription,
  fingerprintFor,
  stableId,
  existingFingerprint,
  dateAtNoon,
  FIELD_OPTIONS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  BATCH_SIZE,
};
export type { FieldKey, Direction, CsvRow, ParsedRow, ImportResult };
