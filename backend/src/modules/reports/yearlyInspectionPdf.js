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
  drawRule,
  drawTableHeader,
  finishWithFooter,
  pluralise,
  toPdfText,
} from "./pdfLayout.js";

import { formatReportDate } from "./reportDates.js";

/*
 * The yearly inspection report as a branded PDF.
 *
 * A pure function of the raw yearly model reports.service.js builds,
 * the same one the Report page draws as HTML. Per zone, per unit and
 * for the location: inspections scheduled against conducted, the
 * completion percentage, observation reports, observations and
 * closures. The completion cell carries its colour band and its
 * percentage in words, so it reads in black and white.
 */

const ROW_HEIGHT = 22;

const COLUMNS = [
  { key: "name", label: "Zone", width: 160 },
  { key: "scheduled", label: "Scheduled", width: 70 },
  { key: "conducted", label: "Conducted", width: 70 },
  { key: "completion", label: "Completion", width: 105 },
  { key: "reports", label: "Observation reports", width: 110 },
  { key: "observations", label: "Observations", width: 80 },
  { key: "approved", label: "Closures approved", width: 95 },
  { key: "open", label: "Closures open", width: 80 },
];

const COLUMN_X = columnPositions(COLUMNS);

function bandColours(totals) {
  if (totals.completionBand === "COMPLETE") {
    return COLOURS.done;
  }

  if (totals.completionBand === "BEHIND") {
    return COLOURS.missed;
  }

  return null;
}

export async function buildYearlyInspectionPdf(
  model,
  { generatedBy },
) {
  const period = model.isPartialYear
    ? `FY ${model.yearLabel} · ${formatReportDate(model.fromDate)} – ${formatReportDate(model.cutoffDate)} (year to date)`
    : `FY ${model.yearLabel} · ${formatReportDate(model.fromDate)} – ${formatReportDate(model.cutoffDate)}`;

  const { doc, finished } =
    await createReportDocument({
      title: "Yearly inspection report",

      subtitle: `${model.plant.name} · ${period}`,

      generatedLine: `Generated ${formatReportDate(model.generatedAt)} by ${generatedBy}`,

      documentTitle: `Yearly inspection report · ${model.plant.name} · FY ${model.yearLabel}`,
    });

  let y = BODY_TOP;

  function text(
    value,
    column,
    {
      bold = false,
      colour = INK,
      size = 8.5,
      offset = 6,
      align = "left",
    } = {},
  ) {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .fillColor(colour)
      .text(
        toPdfText(value),
        COLUMN_X[column] + CELL_PADDING,
        y + offset,
        {
          width:
            COLUMNS[column].width -
            2 * CELL_PADDING,
          height: 11,
          ellipsis: true,
          lineBreak: false,
          align,
        },
      );
  }

  function ensureSpace(height, redraw) {
    if (y + height <= BODY_LIMIT) {
      return;
    }

    doc.addPage();

    y = BODY_TOP;

    redraw();
  }

  /*
   * One row of figures. `scheduled === 0` is a zone that was never on
   * the roster that year: it says so and leaves the percentage out.
   */
  function drawFiguresRow(
    label,
    totals,
    { bold = false, notScheduledLabel = true } = {},
  ) {
    const notScheduled =
      totals.scheduled === 0 &&
      notScheduledLabel;

    const colours = bandColours(totals);

    if (colours) {
      doc
        .rect(
          COLUMN_X[3],
          y,
          COLUMNS[3].width,
          ROW_HEIGHT,
        )
        .fill(colours.fill);
    }

    text(label, 0, { bold });

    if (notScheduled) {
      text("Not scheduled", 1, {
        colour: COLOURS.subtle,
      });

      [2, 3, 4, 5, 6, 7].forEach((column) => {
        text("–", column, {
          colour: COLOURS.subtle,
        });
      });
    } else {
      text(totals.scheduled, 1, { bold });
      text(totals.conducted, 2, { bold });

      text(
        totals.completionPercent === null
          ? "–"
          : `${totals.completionPercent}%`,
        3,
        {
          bold: true,
          colour: colours
            ? colours.text
            : INK,
          offset: 3,
        },
      );

      if (totals.completionPercent !== null) {
        const barWidth =
          COLUMNS[3].width - 2 * CELL_PADDING;

        doc
          .rect(
            COLUMN_X[3] + CELL_PADDING,
            y + 15,
            barWidth,
            4,
          )
          .fill(COLOURS.hairline);

        doc
          .rect(
            COLUMN_X[3] + CELL_PADDING,
            y + 15,
            (barWidth *
              Math.min(
                totals.completionPercent,
                100,
              )) /
              100,
            4,
          )
          .fill(
            colours ? colours.text : INK,
          );
      }

      text(totals.observationReports, 4, {
        bold,
      });
      text(totals.observations, 5, { bold });
      text(totals.closuresApproved, 6, {
        bold,
      });
      text(totals.closuresOpen, 7, { bold });
    }

    y += ROW_HEIGHT;

    drawRule(doc, y, false);
  }

  /* Location summary: four tiles. */
  const { totals } = model;

  const TILE_GAP = 10;

  const tileWidth =
    (CONTENT_WIDTH - 3 * TILE_GAP) / 4;

  const completionColours = bandColours(totals);

  const tiles = [
    {
      label: "Inspections conducted",
      value: `${totals.conducted} of ${totals.scheduled}`,
      caption:
        totals.completionPercent === null
          ? "Nothing scheduled"
          : `${totals.completionPercent}% completed`,
      colours: completionColours,
    },
    {
      label: "Observation reports",
      value: String(totals.observationReports),
      caption: `of ${totals.conducted} conducted · ${totals.noObservationReports} with no observation to record`,
    },
    {
      label: "Observations recorded",
      value: String(totals.observations),
      caption: pluralise(
        totals.observationReports,
        "report",
      ),
    },
    {
      label: "Closures approved",
      value: String(totals.closuresApproved),
      caption: `${totals.closuresOpen} open`,
    },
  ];

  tiles.forEach((tile, index) => {
    const x =
      MARGIN.left +
      index * (tileWidth + TILE_GAP);

    doc
      .roundedRect(x, y, tileWidth, 52, 4)
      .lineWidth(0.75)
      .fillAndStroke(
        tile.colours
          ? tile.colours.fill
          : "#FFFFFF",
        COLOURS.divider,
      );

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLOURS.subtle)
      .text(
        toPdfText(tile.label).toUpperCase(),
        x + 8,
        y + 7,
        {
          width: tileWidth - 16,
          lineBreak: false,
        },
      );

    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(
        tile.colours ? tile.colours.text : INK,
      )
      .text(tile.value, x + 8, y + 18, {
        width: tileWidth - 16,
        lineBreak: false,
      });

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(
        tile.colours
          ? tile.colours.text
          : COLOURS.muted,
      )
      .text(
        toPdfText(tile.caption),
        x + 8,
        y + 38,
        {
          width: tileWidth - 16,
          height: 10,
          ellipsis: true,
          lineBreak: false,
        },
      );
  });

  y += 52 + 8;

  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor(COLOURS.subtle)
    .text(
      `Zones scheduled ${totals.zonesScheduled} · not scheduled ${totals.zonesNotScheduled}. Completion = conducted ÷ scheduled; closures are closures approved. Green = 100%, red = below 75%, each written out as a percentage.`,
      MARGIN.left,
      y,
      { width: CONTENT_WIDTH },
    );

  y += 22;

  /* One table per unit. */
  model.units.forEach((unit) => {
    function drawHead(continued) {
      y = drawBand(
        doc,
        y,
        continued
          ? `${unit.unitName} (continued)`
          : unit.unitName,
      );

      y = drawTableHeader(
        doc,
        y,
        COLUMNS,
        COLUMN_X,
      );
    }

    ensureSpace(18 + 18 + 2 * ROW_HEIGHT, () => {});

    drawHead(false);

    unit.zones.forEach((zone) => {
      ensureSpace(ROW_HEIGHT, () =>
        drawHead(true),
      );

      drawFiguresRow(
        zone.zoneName,
        zone.totals,
      );
    });

    ensureSpace(ROW_HEIGHT, () => drawHead(true));

    drawFiguresRow(
      `${unit.unitName} total`,
      unit.totals,
      {
        bold: true,
        notScheduledLabel: false,
      },
    );

    drawRule(doc, y, true);

    y += 14;
  });

  /* The location as a whole. */
  function drawAllUnitsHead(continued) {
    y = drawBand(
      doc,
      y,
      continued
        ? "All units (continued)"
        : "All units",
    );

    y = drawTableHeader(
      doc,
      y,
      [
        { ...COLUMNS[0], label: "Unit" },
        ...COLUMNS.slice(1),
      ],
      COLUMN_X,
    );
  }

  ensureSpace(
    18 + 18 + (model.units.length + 1) * ROW_HEIGHT,
    () => {},
  );

  drawAllUnitsHead(false);

  model.units.forEach((unit) => {
    ensureSpace(ROW_HEIGHT, () =>
      drawAllUnitsHead(true),
    );

    drawFiguresRow(unit.unitName, unit.totals, {
      notScheduledLabel: false,
    });
  });

  ensureSpace(ROW_HEIGHT, () =>
    drawAllUnitsHead(true),
  );

  drawFiguresRow(
    `${model.plant.name} total`,
    model.totals,
    {
      bold: true,
      notScheduledLabel: false,
    },
  );

  drawRule(doc, y, true);

  return finishWithFooter(
    doc,
    finished,
    "Yearly inspection report",
  );
}
