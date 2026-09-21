import path from "node:path";

import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

const MAX_DATA_ROWS = 500;

const FIELD_BY_NORMALIZED_HEADER = {
  location: "location",
  unit: "unit",
  zone: "zone",
};

/*
 * Normalises a header cell to lowercase letters only, so
 * "Auditor (email)", "Auditor Email" and "auditor_email" all match.
 */
function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function resolveHeaderField(normalized) {
  if (FIELD_BY_NORMALIZED_HEADER[normalized]) {
    return FIELD_BY_NORMALIZED_HEADER[normalized];
  }

  if (normalized.startsWith("auditor")) {
    return "auditorEmail";
  }

  if (normalized.startsWith("auditee")) {
    return "auditeeEmail";
  }

  return null;
}

/*
 * Maps the header row to a column index for each of the five expected
 * fields. Returns null fields for any column that could not be found.
 */
function buildColumnMap(headerCells) {
  const columnByField = {
    location: null,
    unit: null,
    zone: null,
    auditorEmail: null,
    auditeeEmail: null,
  };

  headerCells.forEach((cell, index) => {
    const field = resolveHeaderField(
      normalizeHeader(cell),
    );

    if (field && columnByField[field] === null) {
      columnByField[field] = index;
    }
  });

  return columnByField;
}

const HEADER_ERROR = {
  row: 1,
  field: "header",
  message:
    "The file must have the columns Location, Unit, Zone, Auditor (email) and Auditee (email).",
};

const REQUIRED_FIELDS = [
  ["location", "Location"],
  ["unit", "Unit"],
  ["zone", "Zone"],
  ["auditorEmail", "Auditor (email)"],
  ["auditeeEmail", "Auditee (email)"],
];

/*
 * Turns the raw header + data rows (already split into cells) into
 * parsed roster rows and row-level errors. Shared by the CSV and XLSX
 * readers below so the two formats produce identical results.
 */
function extractRows(rawRows) {
  if (rawRows.length === 0) {
    return { rows: [], errors: [HEADER_ERROR] };
  }

  const columnByField = buildColumnMap(
    rawRows[0],
  );

  const missingHeader = REQUIRED_FIELDS.some(
    ([field]) => columnByField[field] === null,
  );

  if (missingHeader) {
    return { rows: [], errors: [HEADER_ERROR] };
  }

  const rows = [];
  const errors = [];

  for (
    let rowIndex = 1;
    rowIndex < rawRows.length;
    rowIndex += 1
  ) {
    const cells = rawRows[rowIndex];
    const rowNumber = rowIndex + 1;

    const values = {
      location: String(
        cells[columnByField.location] ?? "",
      ).trim(),

      unit: String(
        cells[columnByField.unit] ?? "",
      ).trim(),

      zone: String(
        cells[columnByField.zone] ?? "",
      ).trim(),

      auditorEmail: String(
        cells[columnByField.auditorEmail] ??
          "",
      )
        .trim()
        .toLowerCase(),

      auditeeEmail: String(
        cells[columnByField.auditeeEmail] ??
          "",
      )
        .trim()
        .toLowerCase(),
    };

    const isBlankRow = Object.values(
      values,
    ).every((value) => value === "");

    if (isBlankRow) {
      continue;
    }

    for (const [field, label] of REQUIRED_FIELDS) {
      if (!values[field]) {
        errors.push({
          row: rowNumber,
          field,
          message: `${label} is required.`,
        });
      }
    }

    rows.push({
      rowNumber,
      ...values,
    });
  }

  if (rows.length > MAX_DATA_ROWS) {
    return {
      rows: [],
      errors: [
        {
          row: null,
          field: null,
          message: `The file has more than ${MAX_DATA_ROWS} rows. Split it into smaller uploads.`,
        },
      ],
    };
  }

  return { rows, errors };
}

function parseCsv(buffer) {
  const records = parse(buffer, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  return extractRows(records);
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { rows: [], errors: [HEADER_ERROR] };
  }

  const rawRows = [];

  sheet.eachRow((row) => {
    const cells = [];

    /*
     * Excel turns an email address into a hyperlink, whose `.value` is
     * `{ text, hyperlink }`, and a formula into `{ formula, result }`.
     * `.text` is the display string in every case, so it is used
     * instead of `.value`.
     */
    row.eachCell(
      { includeEmpty: true },
      (cell, columnNumber) => {
        cells[columnNumber - 1] = cell.text;
      },
    );

    rawRows.push(cells);
  });

  return extractRows(rawRows);
}

/**
 * Parses an uploaded roster file (.csv or .xlsx) into rows shaped
 * `{ rowNumber, location, unit, zone, auditorEmail, auditeeEmail }`
 * plus any row-level errors `{ row, field, message }`. Pure function,
 * no database access.
 */
export async function parseRosterFile({
  buffer,
  originalName,
}) {
  const extension = path
    .extname(originalName ?? "")
    .toLowerCase();

  if (extension === ".xlsx") {
    return parseXlsx(buffer);
  }

  return parseCsv(buffer);
}
