/*
 * Regenerates the weekly roster templates in this folder from the
 * master data actually loaded in the database, so the Location / Unit /
 * Zone spellings always match what the importer matches against
 * (backend/src/modules/patrols/rosterParser.js).
 *
 * Run it from the repo root, which mounts this folder into the backend
 * container (exceljs lives there; the host has Node 12):
 *
 *   docker cp docs/samples ehs-inspection-backend-1:/app/samples
 *   docker exec ehs-inspection-backend-1 node /app/samples/generate-roster-template.mjs
 *   docker cp ehs-inspection-backend-1:/app/samples/weekly-roster-template.xlsx docs/samples/
 *   docker cp ehs-inspection-backend-1:/app/samples/weekly-roster-template.csv  docs/samples/
 *
 * The Plan page's "Download template" button builds the same CSV live
 * for the signed-in officer's own location; these files are for filling
 * in offline or sending to someone who does not use the app.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import ExcelJS from "exceljs";

import { databasePool } from "../src/config/database.js";

const OUTPUT_DIRECTORY = path.dirname(
  fileURLToPath(import.meta.url),
);

const HEADERS = [
  "Location",
  "Unit",
  "Zone",
  "Auditor (email)",
  "Auditee (email)",
];

const INSTRUCTIONS = [
  ["How to fill this in", ""],
  [
    "1.",
    "One row per zone. Location, Unit and Zone are already filled in from the system - do not rename them.",
  ],
  [
    "2.",
    "Enter the auditor's and the auditee's email address in the last two columns. Both are required on every row.",
  ],
  [
    "3.",
    "Both people must be registered, active users at the same location. The email has to match their account exactly.",
  ],
  [
    "4.",
    "The auditor and the auditee on the same row must be two different people.",
  ],
  [
    "5.",
    "The same person may cover several zones: repeating an email on more than one row is fine, as auditor, as auditee, or both.",
  ],
  [
    "6.",
    "Leave a row out entirely if that zone should not be audited. Do not delete the header row.",
  ],
  ["", ""],
  ["What happens on upload", ""],
  [
    "",
    "Every zone in the file is scheduled for every Monday from the upload date through 31 December of the current year. You do not enter any dates.",
  ],
  [
    "",
    "Uploading again replaces the plan: upcoming Monday audits generated from the previous roster are rebuilt. Audits already carried out, and any audit scheduled by hand, are left alone.",
  ],
  [
    "",
    "If any row has a problem, nothing is saved and every problem is listed with its row number, so fix them and upload again.",
  ],
  [
    "",
    "Afterwards you can still change the auditor or auditee for a zone from the dashboard, and the change applies to every remaining Monday of the year.",
  ],
];

async function loadZones() {
  const result = await databasePool.query(
    `
      SELECT
        plant_record.name AS location,
        unit_record.name AS unit,
        zone_record.name AS zone

      FROM plants AS plant_record

      JOIN units AS unit_record
        ON unit_record.plant_id = plant_record.id
       AND unit_record.is_active

      JOIN zones AS zone_record
        ON zone_record.unit_id = unit_record.id
       AND zone_record.is_active

      WHERE
        plant_record.is_active
        /*
         * A zone with no areas cannot be audited: the observation form
         * would have no area to attribute a finding to, and the
         * importer rejects it.
         */
        AND EXISTS (
          SELECT 1
          FROM zone_areas AS area
          WHERE area.zone_id = zone_record.id
            AND area.is_active
        )

      ORDER BY
        plant_record.name,
        unit_record.unit_number,
        unit_record.name,
        zone_record.zone_number,
        zone_record.name
    `,
  );

  return result.rows;
}

function toCsvField(value) {
  const text = String(value ?? "");

  return /[",\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

async function writeCsv(zones) {
  const lines = [
    HEADERS.join(","),

    ...zones.map((zone) =>
      [
        toCsvField(zone.location),
        toCsvField(zone.unit),
        toCsvField(zone.zone),
        "",
        "",
      ].join(","),
    ),
  ];

  await writeFile(
    path.join(
      OUTPUT_DIRECTORY,
      "weekly-roster-template.csv",
    ),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

async function writeXlsx(zones) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "EHS Inspection App";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Roster", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: HEADERS[0], key: "location", width: 16 },
    { header: HEADERS[1], key: "unit", width: 14 },
    { header: HEADERS[2], key: "zone", width: 14 },
    { header: HEADERS[3], key: "auditor", width: 34 },
    { header: HEADERS[4], key: "auditee", width: 34 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF087F5B" },
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  zones.forEach((zone) => {
    const row = sheet.addRow({
      location: zone.location,
      unit: zone.unit,
      zone: zone.zone,
      auditor: "",
      auditee: "",
    });

    /* The three filled columns are read-only facts; grey them. */
    ["location", "unit", "zone"].forEach((key) => {
      row.getCell(key).font = { color: { argb: "FF475467" } };
    });

    ["auditor", "auditee"].forEach((key) => {
      row.getCell(key).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFBEB" },
      };
    });
  });

  const notes = workbook.addWorksheet("Instructions");

  notes.columns = [
    { width: 6 },
    { width: 110 },
  ];

  INSTRUCTIONS.forEach((line) => {
    const row = notes.addRow(line);

    row.getCell(2).alignment = { wrapText: true, vertical: "top" };

    if (!line[0] && !line[1]) {
      return;
    }

    if (!line[1]) {
      row.font = { bold: true, size: 12 };
    }
  });

  await workbook.xlsx.writeFile(
    path.join(
      OUTPUT_DIRECTORY,
      "weekly-roster-template.xlsx",
    ),
  );
}

const zones = await loadZones();

if (zones.length === 0) {
  throw new Error(
    "No auditable zones found. Load the location master data first.",
  );
}

await writeCsv(zones);
await writeXlsx(zones);

console.log(
  `Wrote templates for ${zones.length} zones.`,
);

await databasePool.end();
