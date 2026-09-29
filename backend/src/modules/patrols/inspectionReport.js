import ExcelJS from "exceljs";

/*
 * The EHS Officer's zone-by-week inspection report.
 *
 * One row per zone, one column per inspection week, each cell green
 * when that zone's audit happened and red when it did not. The point of
 * the sheet is to make a row of red obvious at a glance, so the colour
 * carries the message — but every coloured cell also carries text, so
 * the report still reads when printed in black and white, and so the
 * status survives being pasted somewhere that drops the formatting.
 */

/*
 * `wrap` lets a zone's area list run onto a second line rather than
 * widening the frozen block and pushing the weeks off screen. `centred`
 * marks the two count columns, which read as numbers like the weeks.
 */
const FIXED_COLUMNS = [
  { header: "Unit", width: 18 },
  { header: "Zone", width: 20 },
  { header: "Zone Areas", width: 22, wrap: true },
  { header: "Auditor", width: 24 },
  { header: "Auditee", width: 24 },
  { header: "Done", width: 8, centred: true },
  { header: "Scheduled", width: 11, centred: true },
];

const WEEK_COLUMN_WIDTH = 13;

const FILLS = {
  done: "FFD1FADF",
  missed: "FFFEE4E2",
  notScheduled: "FFF2F4F7",
  header: "FF101828",
};

const FONT_COLOURS = {
  done: "FF05603A",
  missed: "FF912018",
  notScheduled: "FF98A2B3",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "22 Sep" from a "YYYY-MM-DD" string, built by hand rather than
 * through Date so the label can never drift a day on a server in a
 * different time zone.
 */
export function formatWeekLabel(dateOnly) {
  const [, month, day] = dateOnly
    .split("-")
    .map(Number);

  return `${day} ${MONTH_NAMES[month - 1]}`;
}

function paint(cell, kind) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: FILLS[kind] },
  };

  cell.font = {
    color: { argb: FONT_COLOURS[kind] },
    bold: kind !== "notScheduled",
    size: 10,
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
}

/**
 * Builds the workbook and returns it as a Buffer.
 *
 * `weeks` are the inspection weeks in order, each `{ weekStart,
 * isoWeek }`. `rows` are the zones in display order, each carrying a
 * `cells` map keyed by `weekStart`.
 */
export async function buildInspectionReportWorkbook({
  plantName,
  fromDate,
  cutoffDate,
  weeks,
  rows,
}) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "EHS Inspection App";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(
    "Inspections by zone",
    {
      views: [
        {
          state: "frozen",
          /* Keep the zone and its people in view while scrolling weeks. */
          xSplit: FIXED_COLUMNS.length,
          ySplit: 4,
        },
      ],

      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    },
  );

  const totalColumns =
    FIXED_COLUMNS.length + weeks.length;

  sheet.columns = [
    ...FIXED_COLUMNS.map((column) => ({
      width: column.width,
    })),

    ...weeks.map(() => ({
      width: WEEK_COLUMN_WIDTH,
    })),
  ];

  /* Title block. */
  const titleRow = sheet.addRow([
    "Inspection status by zone",
  ]);

  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, Math.max(totalColumns, 2));

  const subtitleRow = sheet.addRow([
    `${plantName} · ${formatWeekLabel(fromDate)} to ${formatWeekLabel(cutoffDate)} · generated ${
      new Date().toISOString().slice(0, 10)
    }`,
  ]);

  subtitleRow.font = {
    size: 10,
    color: { argb: "FF667085" },
  };

  sheet.mergeCells(2, 1, 2, Math.max(totalColumns, 2));

  const legendRow = sheet.addRow([
    "Green = inspection carried out · Red = not carried out · Grey = none scheduled that week." +
      " Auditor and auditee are those on the zone's most recent inspection, which may differ from who is rostered for upcoming weeks.",
  ]);

  legendRow.font = {
    size: 9,
    italic: true,
    color: { argb: "FF667085" },
  };

  sheet.mergeCells(3, 1, 3, Math.max(totalColumns, 2));

  /* Header row. */
  const headerRow = sheet.addRow([
    ...FIXED_COLUMNS.map(
      (column) => column.header,
    ),

    ...weeks.map(
      (week) =>
        `W${week.isoWeek}\n${formatWeekLabel(
          week.weekStart,
        )}`,
    ),
  ]);

  headerRow.height = 30;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: FILLS.header },
    };

    cell.font = {
      bold: true,
      size: 10,
      color: { argb: "FFFFFFFF" },
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  });

  rows.forEach((zone) => {
    const weekValues = weeks.map((week) => {
      const cell = zone.cells[week.weekStart];

      if (!cell) {
        return "–";
      }

      return cell.conductedCount >=
        cell.scheduledCount
        ? "Done"
        : "Not done";
    });

    const areaNames = zone.areaNames ?? [];

    const row = sheet.addRow([
      zone.unitName,
      zone.zoneName,
      areaNames.length > 0
        ? areaNames.join(", ")
        : "None configured",
      zone.auditorName ?? "Not assigned",
      zone.auditeeName ?? "Not assigned",
      zone.conductedTotal,
      zone.scheduledTotal,
      ...weekValues,
    ]);

    row.alignment = { vertical: "middle" };

    FIXED_COLUMNS.forEach((column, index) => {
      if (!column.centred && !column.wrap) {
        return;
      }

      row.getCell(index + 1).alignment = {
        vertical: "middle",
        ...(column.centred
          ? { horizontal: "center" }
          : {}),
        ...(column.wrap
          ? { wrapText: true }
          : {}),
      };
    });

    weeks.forEach((week, index) => {
      const cell = row.getCell(
        FIXED_COLUMNS.length + index + 1,
      );

      const status = zone.cells[week.weekStart];

      if (!status) {
        paint(cell, "notScheduled");

        return;
      }

      paint(
        cell,
        status.conductedCount >=
          status.scheduledCount
          ? "done"
          : "missed",
      );
    });
  });

  if (rows.length === 0) {
    const emptyRow = sheet.addRow([
      "No zones with inspections in this period.",
    ]);

    emptyRow.font = {
      italic: true,
      color: { argb: "FF667085" },
    };
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: FIXED_COLUMNS.length },
  };

  return workbook.xlsx.writeBuffer();
}
