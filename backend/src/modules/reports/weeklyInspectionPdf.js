import { readFile } from "node:fs/promises";

import PDFDocument from "pdfkit";

import {
  BRAND,
  footerLegal,
} from "../../shared/brand.js";

/*
 * The weekly inspection report as a branded PDF.
 *
 * A pure function of the view model patrol.service.js builds: all the
 * counting and labelling is done there, so this file only draws. That is
 * also what lets it be checked with fixture data and no database.
 *
 * Green and red carry the status, and every status is also written out
 * in words, so the report still reads when printed in black and white.
 */

const INK = "#101828";

const COLOURS = {
  text: INK,
  strong: "#344054",
  muted: "#475467",
  subtle: "#667085",
  hairline: "#EAECF0",
  divider: "#D0D5DD",
  headerBand: "#F2F4F7",
  done: { fill: "#D1FADF", text: "#05603A" },
  missed: { fill: "#FEE4E2", text: "#912018" },
};

/* A4 landscape, in points. */
const PAGE_HEIGHT = 595;

const MARGIN = {
  top: 36,
  bottom: 40,
  left: 36,
  right: 36,
};

const CONTENT_WIDTH = 770;
const BODY_TOP = 94;

/* Leaves room for the footer under the last row. */
const BODY_LIMIT =
  PAGE_HEIGHT - MARGIN.bottom - 24;

const CELL_PADDING = 4;

const COLUMNS = [
  { key: "zone", label: "Zone", width: 76 },
  { key: "people", label: "Auditor / Auditee", width: 95 },
  { key: "status", label: "Inspection", width: 85 },
  { key: "seq", label: "#", width: 18 },
  { key: "area", label: "Area", width: 60 },
  { key: "category", label: "Cat.", width: 28 },
  { key: "risk", label: "Risk", width: 40 },
  { key: "observation", label: "Observation", width: 128 },
  { key: "plan", label: "Action plan", width: 128 },
  { key: "target", label: "Target", width: 52 },
  { key: "closure", label: "Closure", width: 60 },
];

const COLUMN_X = (() => {
  let x = MARGIN.left;

  return COLUMNS.map((column) => {
    const start = x;

    x += column.width;

    return start;
  });
})();

/*
 * Windows-1252 is what pdfkit's built-in fonts can print. Anything else
 * would come out as the wrong glyph, so it is replaced with "?" rather
 * than left to fail quietly.
 */
const CP1252_EXTRAS =
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function toPdfText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim()
    .replace(
      /[^ -~ -ÿ\n]/g,
      (character) =>
        CP1252_EXTRAS.includes(character)
          ? character
          : "?",
    );
}

function line(
  text,
  {
    bold = false,
    size = 7.5,
    colour = COLOURS.text,
  } = {},
) {
  return {
    text: toPdfText(text),
    bold,
    size,
    colour,
  };
}

function useFont(doc, cellLine) {
  doc
    .font(
      cellLine.bold
        ? "Helvetica-Bold"
        : "Helvetica",
    )
    .fontSize(cellLine.size);
}

function measureLines(doc, lines, width) {
  return lines.reduce((total, cellLine) => {
    useFont(doc, cellLine);

    return (
      total +
      doc.heightOfString(cellLine.text || " ", {
        width,
        lineGap: 1,
      })
    );
  }, 0);
}

function drawLines(doc, lines, x, y, width) {
  let cursor = y;

  lines.forEach((cellLine) => {
    useFont(doc, cellLine);

    doc.fillColor(cellLine.colour).text(
      cellLine.text,
      x,
      cursor,
      { width, lineGap: 1 },
    );

    cursor += doc.heightOfString(
      cellLine.text || " ",
      { width, lineGap: 1 },
    );
  });
}

function pluralise(count, singular) {
  return `${count} ${singular}${
    count === 1 ? "" : "s"
  }`;
}

function statusColours(inspection) {
  return inspection.outcome === "NOT_DONE"
    ? COLOURS.missed
    : COLOURS.done;
}

function statusLines(inspection) {
  const colours = statusColours(inspection);

  if (inspection.outcome === "NOT_DONE") {
    return [
      line("Not done", {
        bold: true,
        colour: colours.text,
      }),

      ...(inspection.notYetDue
        ? [
            line(
              `Due by ${inspection.dueDay}`,
              {
                size: 7,
                colour: colours.text,
              },
            ),
          ]
        : []),
    ];
  }

  return [
    line("Inspected", {
      bold: true,
      colour: colours.text,
    }),

    line(
      inspection.outcome === "NO_OBSERVATIONS"
        ? "No observation to record"
        : pluralise(
            inspection.observations.length,
            "observation",
          ),
      { colour: colours.text },
    ),

    ...(inspection.reportNumber
      ? [
          line(inspection.reportNumber, {
            size: 7,
            colour: colours.text,
          }),
        ]
      : []),
  ];
}

/**
 * The rows one inspection takes: one per observation, or a single row
 * when there is nothing to list. The zone, people and closure cells sit
 * on the first row only.
 */
function buildInspectionRows(inspection) {
  const observations =
    inspection.observations.length > 0
      ? inspection.observations
      : [null];

  return observations.map(
    (observation, index) => {
      const first = index === 0;

      const cells = {
        zone: first
          ? [
              line(inspection.zoneName, {
                bold: true,
              }),
              line(inspection.scheduledDate, {
                size: 7,
                colour: COLOURS.subtle,
              }),
            ]
          : [],

        people: first
          ? [
              line(
                `Auditor: ${inspection.auditorName}`,
              ),
              line(
                `Auditee: ${inspection.auditeeName}`,
              ),
            ]
          : [],

        status: first
          ? statusLines(inspection)
          : [],

        closure:
          first && inspection.closureLabel
            ? [
                line(inspection.closureLabel, {
                  size: 7,
                }),

                ...(inspection.reviewComments
                  ? [
                      line(
                        inspection.reviewComments,
                        {
                          size: 7,
                          colour:
                            COLOURS.subtle,
                        },
                      ),
                    ]
                  : []),
              ]
            : [],
      };

      if (observation) {
        cells.seq = [
          line(observation.sequenceNumber),
        ];

        cells.area = [
          line(observation.areaName ?? "–"),
        ];

        cells.category = [
          line(observation.category),
        ];

        cells.risk = [
          line(observation.riskLabel, {
            bold: observation.riskLabel === "High",
          }),
        ];

        cells.observation = [
          line(observation.description),
        ];

        cells.plan = [
          line(
            observation.actionPlan ||
              "Not yet provided",
            {
              colour: observation.actionPlan
                ? COLOURS.text
                : COLOURS.subtle,
            },
          ),

          ...(observation.evidenceCount > 0
            ? [
                line(
                  `(${pluralise(
                    observation.evidenceCount,
                    "evidence photo",
                  )})`,
                  {
                    size: 7,
                    colour: COLOURS.subtle,
                  },
                ),
              ]
            : []),
        ];

        cells.target = [
          line(observation.targetDate ?? "–"),
        ];
      }

      return { first, cells };
    },
  );
}

export async function buildWeeklyInspectionPdf(
  model,
) {
  const logo = await readFile(
    BRAND.reportLogoPath,
  );

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: MARGIN,
    bufferPages: true,

    info: {
      Title: `Weekly inspection report · ${model.plantName} · Week ${model.isoWeek}, ${model.isoYear}`,
      Author: BRAND.companyName,
      Creator: BRAND.productName,
    },
  });

  const chunks = [];

  doc.on("data", (chunk) => {
    chunks.push(chunk);
  });

  const finished = new Promise(
    (resolve, reject) => {
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);
    },
  );

  function drawPageHeader() {
    doc.image(logo, MARGIN.left, 30, {
      fit: [150, 45],
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(INK)
      .text(
        "Weekly inspection report",
        MARGIN.left,
        28,
        {
          width: CONTENT_WIDTH,
          align: "right",
        },
      );

    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLOURS.muted)
      .text(
        toPdfText(
          `${model.plantName} · Week ${model.isoWeek}, ${model.isoYear} · ${model.weekStart} – ${model.weekEnd}`,
        ),
        MARGIN.left,
        48,
        {
          width: CONTENT_WIDTH,
          align: "right",
        },
      );

    doc
      .fontSize(8)
      .fillColor(COLOURS.subtle)
      .text(
        toPdfText(
          `Generated ${model.generatedAt} by ${model.generatedBy}`,
        ),
        MARGIN.left,
        62,
        {
          width: CONTENT_WIDTH,
          align: "right",
        },
      );

    doc
      .moveTo(MARGIN.left, 84)
      .lineTo(MARGIN.left + CONTENT_WIDTH, 84)
      .lineWidth(0.75)
      .strokeColor(COLOURS.hairline)
      .stroke();
  }

  /*
   * The first page already exists by the time a listener could be
   * attached, so its header is drawn by hand; every later page gets
   * its header here.
   */
  doc.on("pageAdded", drawPageHeader);

  drawPageHeader();

  let y = BODY_TOP;

  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor(COLOURS.subtle)
    .text(
      "Green = inspection carried out · Red = not carried out. Each status is written out, so this report reads in black and white.",
      MARGIN.left,
      y,
      { width: CONTENT_WIDTH },
    );

  y += 18;

  function drawUnitBand(unitName, continued) {
    doc
      .rect(MARGIN.left, y, CONTENT_WIDTH, 18)
      .fill(INK);

    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor("#FFFFFF")
      .text(
        toPdfText(
          continued
            ? `${unitName} (continued)`
            : unitName,
        ),
        MARGIN.left + 6,
        y + 4.5,
        { width: CONTENT_WIDTH - 12 },
      );

    y += 18;
  }

  function drawColumnHeader() {
    doc
      .rect(MARGIN.left, y, CONTENT_WIDTH, 18)
      .fill(COLOURS.headerBand);

    COLUMNS.forEach((column, index) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLOURS.strong)
        .text(
          column.label.toUpperCase(),
          COLUMN_X[index] + CELL_PADDING,
          y + 5.5,
          {
            width: column.width - 2 * CELL_PADDING,
          },
        );
    });

    y += 18;
  }

  /*
   * Starts a new page when the next block will not fit. `redraw` puts
   * back whatever the page needs above the block (a unit band and a
   * column header, or just a header).
   */
  function ensureSpace(height, redraw) {
    if (y + height <= BODY_LIMIT) {
      return false;
    }

    doc.addPage();

    y = BODY_TOP;

    redraw();

    return true;
  }

  function drawRow(row, inspection, unitName) {
    let cells = row.cells;

    let height =
      Math.max(
        ...COLUMNS.map((column) =>
          measureLines(
            doc,
            cells[column.key] ?? [],
            column.width - 2 * CELL_PADDING,
          ),
        ),
        10,
      ) +
      2 * CELL_PADDING;

    const paged = ensureSpace(height, () => {
      drawUnitBand(unitName, true);
      drawColumnHeader();
    });

    /*
     * A group broken across pages names its zone again at the top of
     * the new page, so the row is never an orphan.
     */
    if (paged && !row.first) {
      cells = {
        ...cells,

        zone: [
          line(inspection.zoneName, {
            bold: true,
          }),
          line("(cont.)", {
            size: 7,
            colour: COLOURS.subtle,
          }),
        ],
      };

      height = Math.max(
        height,
        measureLines(
          doc,
          cells.zone,
          COLUMNS[0].width - 2 * CELL_PADDING,
        ) +
          2 * CELL_PADDING,
      );
    }

    const statusIndex = COLUMNS.findIndex(
      (column) => column.key === "status",
    );

    doc
      .rect(
        COLUMN_X[statusIndex],
        y,
        COLUMNS[statusIndex].width,
        height,
      )
      .fill(statusColours(inspection).fill);

    COLUMNS.forEach((column, index) => {
      drawLines(
        doc,
        cells[column.key] ?? [],
        COLUMN_X[index] + CELL_PADDING,
        y + CELL_PADDING,
        column.width - 2 * CELL_PADDING,
      );
    });

    y += height;

    return height;
  }

  function drawRule(isGroupEnd) {
    doc
      .moveTo(MARGIN.left, y)
      .lineTo(MARGIN.left + CONTENT_WIDTH, y)
      .lineWidth(isGroupEnd ? 1 : 0.5)
      .strokeColor(
        isGroupEnd
          ? COLOURS.divider
          : COLOURS.hairline,
      )
      .stroke();
  }

  model.units.forEach((unit) => {
    ensureSpace(90, () => {});

    drawUnitBand(unit.unitName, false);
    drawColumnHeader();

    unit.inspections.forEach((inspection) => {
      const rows = buildInspectionRows({
        ...inspection,
        dueDay: model.dueDay,
      });

      rows.forEach((row, index) => {
        drawRow(
          row,
          { ...inspection },
          unit.unitName,
        );

        drawRule(index === rows.length - 1);
      });
    });

    y += 12;
  });

  /* Summary */
  const { summary } = model;

  if (y + 230 > BODY_LIMIT) {
    doc.addPage();

    y = BODY_TOP;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK)
    .text(
      `Summary · Week ${model.isoWeek}, ${model.isoYear}`,
      MARGIN.left,
      y,
      { width: CONTENT_WIDTH },
    );

  y += 22;

  const percentage =
    summary.zonesToInspect > 0
      ? Math.round(
          (summary.zonesInspected /
            summary.zonesToInspect) *
            100,
        )
      : 0;

  const keyValueRows = [
    [
      "Zones to be inspected",
      String(summary.zonesToInspect),
    ],
    [
      "Zones inspected",
      `${summary.zonesInspected} (${percentage}%)`,
      COLOURS.done,
    ],
    [
      "Zones not inspected",
      String(summary.zonesNotInspected),
      summary.zonesNotInspected > 0
        ? COLOURS.missed
        : null,
    ],
    [
      "Inspected zones with observations",
      String(summary.inspectedWithObservations),
    ],
    [
      "Inspected zones with no observation to record",
      String(
        summary.inspectedWithoutObservations,
      ),
    ],
    [
      "Observations recorded",
      `${summary.totalObservations} (High ${summary.risk.high} · Medium ${summary.risk.medium} · Low ${summary.risk.low})`,
    ],
    [
      "Closures",
      `Approved ${summary.closures.approved} · Awaiting approval ${summary.closures.awaitingApproval} · In progress ${summary.closures.inProgress} · Returned ${summary.closures.returned}`,
    ],
  ];

  const LABEL_WIDTH = 240;
  const VALUE_WIDTH = 330;

  keyValueRows.forEach(
    ([label, value, colours]) => {
      doc
        .rect(
          MARGIN.left + LABEL_WIDTH,
          y,
          VALUE_WIDTH,
          18,
        )
        .fill(colours ? colours.fill : "#FFFFFF");

      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLOURS.muted)
        .text(
          toPdfText(label),
          MARGIN.left + CELL_PADDING,
          y + 5,
          {
            width: LABEL_WIDTH - 2 * CELL_PADDING,
          },
        );

      doc
        .font("Helvetica-Bold")
        .fillColor(
          colours ? colours.text : INK,
        )
        .text(
          toPdfText(value),
          MARGIN.left +
            LABEL_WIDTH +
            CELL_PADDING,
          y + 5,
          {
            width: VALUE_WIDTH - 2 * CELL_PADDING,
          },
        );

      y += 18;

      doc
        .moveTo(MARGIN.left, y)
        .lineTo(
          MARGIN.left + LABEL_WIDTH + VALUE_WIDTH,
          y,
        )
        .lineWidth(0.5)
        .strokeColor(COLOURS.hairline)
        .stroke();
    },
  );

  y += 16;

  const unitColumns = [
    { label: "Unit", width: 300 },
    { label: "To inspect", width: 90 },
    { label: "Inspected", width: 90 },
    { label: "With observations", width: 110 },
  ];

  function drawUnitSummaryHeader() {
    let x = MARGIN.left;

    doc
      .rect(
        MARGIN.left,
        y,
        unitColumns.reduce(
          (sum, column) => sum + column.width,
          0,
        ),
        18,
      )
      .fill(COLOURS.headerBand);

    unitColumns.forEach((column) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLOURS.strong)
        .text(
          column.label.toUpperCase(),
          x + CELL_PADDING,
          y + 5.5,
          {
            width: column.width - 2 * CELL_PADDING,
          },
        );

      x += column.width;
    });

    y += 18;
  }

  ensureSpace(
    36 + 18 * summary.byUnit.length,
    () => {},
  );

  drawUnitSummaryHeader();

  summary.byUnit.forEach((unit) => {
    ensureSpace(18, drawUnitSummaryHeader);

    let x = MARGIN.left;

    [
      unit.unitName,
      unit.zonesToInspect,
      unit.zonesInspected,
      unit.inspectedWithObservations,
    ].forEach((value, index) => {
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(INK)
        .text(
          toPdfText(value),
          x + CELL_PADDING,
          y + 5,
          {
            width:
              unitColumns[index].width -
              2 * CELL_PADDING,
          },
        );

      x += unitColumns[index].width;
    });

    y += 18;

    doc
      .moveTo(MARGIN.left, y)
      .lineTo(
        MARGIN.left +
          unitColumns.reduce(
            (sum, column) => sum + column.width,
            0,
          ),
        y,
      )
      .lineWidth(0.5)
      .strokeColor(COLOURS.hairline)
      .stroke();
  });

  /* Footer, on every page once the total is known. */
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    /*
     * Writing below the bottom margin would make pdfkit add a page.
     */
    doc.page.margins.bottom = 0;

    doc
      .moveTo(MARGIN.left, PAGE_HEIGHT - 30)
      .lineTo(
        MARGIN.left + CONTENT_WIDTH,
        PAGE_HEIGHT - 30,
      )
      .lineWidth(0.5)
      .strokeColor(COLOURS.hairline)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLOURS.subtle)
      .text(
        toPdfText(
          `${footerLegal()} · ${BRAND.productName} · Weekly inspection report`,
        ),
        MARGIN.left,
        PAGE_HEIGHT - 24,
        {
          width: CONTENT_WIDTH,
          align: "left",
          lineBreak: false,
        },
      );

    doc.text(
      `Page ${index + 1} of ${range.count}`,
      MARGIN.left,
      PAGE_HEIGHT - 24,
      {
        width: CONTENT_WIDTH,
        align: "right",
        lineBreak: false,
      },
    );
  }

  doc.end();

  return finished;
}
