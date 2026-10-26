import {
  BODY_LIMIT,
  BODY_TOP,
  CELL_PADDING,
  COLOURS,
  CONTENT_WIDTH,
  INK,
  MARGIN,
  columnPositions,
  createReportDocument,
  drawBand,
  drawLines,
  drawRule as drawSharedRule,
  drawTableHeader,
  finishWithFooter,
  line,
  measureLines,
  pluralise,
  toPdfText,
} from "./pdfLayout.js";

import {
  formatDayAndMonth,
  formatReportDate,
} from "./reportDates.js";

/*
 * The weekly inspection report as a branded PDF.
 *
 * A pure function of the raw weekly model reports.service.js builds
 * (ISO dates, codes and ready-made labels): all the counting and
 * labelling is done there, so this file only draws. That is also what
 * lets it be checked with fixture data and no database. The same model
 * is what the Report page draws as HTML, so the two cannot disagree.
 *
 * Green and red carry the status, and every status is also written out
 * in words, so the report still reads when printed in black and white.
 */

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

const COLUMN_X = columnPositions(COLUMNS);

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
              line(formatReportDate(inspection.scheduledDate), {
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
              ...(inspection.hodName
                ? [
                    line(
                      `HOD: ${inspection.hodName}`,
                    ),
                  ]
                : []),
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
          line(
            observation.targetDate
              ? formatReportDate(
                  observation.targetDate,
                )
              : "–",
          ),
        ];
      }

      return { first, cells };
    },
  );
}

/*
 * The photograph block (docs/24 D21): up to four photographs per row,
 * each fitted in a 175 x 130 pt frame with a label under it.
 */
const PHOTO_WIDTH = 175;
const PHOTO_HEIGHT = 130;
const PHOTO_GAP = 12;
const PHOTO_LABEL_HEIGHT = 12;
const PHOTOS_PER_ROW = 4;

/**
 * `photos` maps an observation's item id to a JPEG buffer, or to null
 * when it could not be added. Omit it for a text-only report.
 */
export async function buildWeeklyInspectionPdf(
  model,
  {
    generatedBy,
    photos = null,
  },
) {
  const dueDay = formatDayAndMonth(
    model.dueDate,
    "Thu",
  );

  const { doc, finished } =
    await createReportDocument({
      title: "Weekly inspection report",

      subtitle: `${model.plant.name} · Week ${model.fiscalWeek}, FY ${model.fiscalYearLabel} · ${formatReportDate(model.weekStart)} – ${formatReportDate(model.weekEnd)}`,

      generatedLine: `Generated ${formatReportDate(model.generatedAt)} by ${generatedBy}`,

      documentTitle: `Weekly inspection report · ${model.plant.name} · Week ${model.fiscalWeek}, FY ${model.fiscalYearLabel}`,
    });

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
    y = drawBand(
      doc,
      y,
      continued
        ? `${unitName} (continued)`
        : unitName,
    );
  }

  function drawColumnHeader() {
    y = drawTableHeader(
      doc,
      y,
      COLUMNS,
      COLUMN_X,
    );
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
    drawSharedRule(doc, y, isGroupEnd);
  }

  function drawPhotoCaption(text) {
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLOURS.strong)
      .text(
        toPdfText(text),
        MARGIN.left + CELL_PADDING,
        y + 4,
        { width: CONTENT_WIDTH, lineBreak: false },
      );

    y += 16;
  }

  /*
   * After an inspection's rows: its observation photographs, labelled
   * with the observation number and area. A photograph that could not
   * be added shows a placeholder naming the report, so it can be opened
   * in the app.
   */
  function drawPhotoBlock(inspection, unitName) {
    if (
      !photos ||
      inspection.observations.length === 0
    ) {
      return;
    }

    const rowHeight =
      PHOTO_HEIGHT + PHOTO_LABEL_HEIGHT + 8;

    ensureSpace(16 + rowHeight, () =>
      drawUnitBand(unitName, true),
    );

    drawPhotoCaption(
      `Photographs · ${inspection.zoneName}`,
    );

    for (
      let start = 0;
      start < inspection.observations.length;
      start += PHOTOS_PER_ROW
    ) {
      ensureSpace(rowHeight, () => {
        drawUnitBand(unitName, true);

        drawPhotoCaption(
          `Photographs · ${inspection.zoneName} (cont.)`,
        );
      });

      inspection.observations
        .slice(start, start + PHOTOS_PER_ROW)
        .forEach((observation, offset) => {
          const x =
            MARGIN.left +
            CELL_PADDING +
            offset * (PHOTO_WIDTH + PHOTO_GAP);

          const buffer = photos.get(
            observation.itemId,
          );

          doc
            .rect(x, y, PHOTO_WIDTH, PHOTO_HEIGHT)
            .lineWidth(0.5)
            .strokeColor(COLOURS.divider)
            .stroke();

          if (buffer) {
            doc.image(buffer, x + 1, y + 1, {
              fit: [
                PHOTO_WIDTH - 2,
                PHOTO_HEIGHT - 2,
              ],
              align: "center",
              valign: "center",
            });
          } else {
            doc
              .rect(
                x + 1,
                y + 1,
                PHOTO_WIDTH - 2,
                PHOTO_HEIGHT - 2,
              )
              .fill(COLOURS.headerBand);

            doc
              .font("Helvetica")
              .fontSize(7.5)
              .fillColor(COLOURS.muted)
              .text(
                toPdfText(
                  `Photograph not available in the PDF. Open report ${
                    inspection.reportNumber ?? ""
                  } in the app.`,
                ),
                x + 10,
                y + PHOTO_HEIGHT / 2 - 12,
                {
                  width: PHOTO_WIDTH - 20,
                  align: "center",
                },
              );
          }

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(COLOURS.subtle)
            .text(
              toPdfText(
                `Obs ${observation.sequenceNumber} · ${
                  observation.areaName ?? "–"
                }`,
              ),
              x,
              y + PHOTO_HEIGHT + 3,
              {
                width: PHOTO_WIDTH,
                lineBreak: false,
                ellipsis: true,
              },
            );
        });

      y += rowHeight;
    }

    drawRule(true);
  }

  model.units.forEach((unit) => {
    ensureSpace(90, () => {});

    drawUnitBand(unit.unitName, false);
    drawColumnHeader();

    unit.inspections.forEach((inspection) => {
      const rows = buildInspectionRows({
        ...inspection,
        dueDay,
      });

      rows.forEach((row, index) => {
        drawRow(
          row,
          { ...inspection },
          unit.unitName,
        );

        drawRule(index === rows.length - 1);
      });

      drawPhotoBlock(inspection, unit.unitName);
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
      `Summary · Week ${model.fiscalWeek}, FY ${model.fiscalYearLabel}`,
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

  return finishWithFooter(
    doc,
    finished,
    "Weekly inspection report",
  );
}
