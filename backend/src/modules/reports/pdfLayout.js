import { readFile } from "node:fs/promises";

import PDFDocument from "pdfkit";

import {
  BRAND,
  footerLegal,
} from "../../shared/brand.js";

/*
 * What the weekly and yearly report PDFs share (docs/23): the house
 * colours, the page geometry, text handling, the branded page header,
 * the table bands and the "Page x of y" footer. Each report's own
 * tables and summary stay in its own file.
 */

export const INK = "#101828";

export const COLOURS = {
  text: INK,
  strong: "#344054",
  muted: "#475467",
  subtle: "#667085",
  hairline: "#EAECF0",
  divider: "#D0D5DD",
  headerBand: "#F2F4F7",
  done: { fill: "#D1FADF", text: "#05603A" },
  missed: { fill: "#FEE4E2", text: "#912018" },
  neutral: { fill: "#F2F4F7", text: INK },
};

/* A4 landscape, in points. */
export const PAGE_HEIGHT = 595;

export const MARGIN = {
  top: 36,
  bottom: 40,
  left: 36,
  right: 36,
};

export const CONTENT_WIDTH = 770;
export const BODY_TOP = 94;

/* Leaves room for the footer under the last row. */
export const BODY_LIMIT =
  PAGE_HEIGHT - MARGIN.bottom - 24;

export const CELL_PADDING = 4;

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

/**
 * One styled line of a table cell.
 */
export function line(
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

export function measureLines(doc, lines, width) {
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

export function drawLines(doc, lines, x, y, width) {
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

export function pluralise(count, singular) {
  return `${count} ${singular}${
    count === 1 ? "" : "s"
  }`;
}

/**
 * The x position of each column, left to right from the page margin.
 */
export function columnPositions(columns) {
  let x = MARGIN.left;

  return columns.map((column) => {
    const start = x;

    x += column.width;

    return start;
  });
}

/**
 * Creates the A4 landscape document with the Sona Comstar header on
 * every page, and a promise for the finished bytes. Drawing starts at
 * BODY_TOP.
 *
 * `title` is the big right-aligned heading, `subtitle` the line under
 * it, `generatedLine` the small grey line under that.
 */
export async function createReportDocument({
  title,
  subtitle,
  generatedLine,
  documentTitle,
}) {
  const logo = await readFile(
    BRAND.reportLogoPath,
  );

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: MARGIN,
    bufferPages: true,

    info: {
      Title: toPdfText(documentTitle ?? title),
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
        toPdfText(title),
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
        toPdfText(subtitle),
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
        toPdfText(generatedLine),
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

  return { doc, finished };
}

/**
 * The ink band naming a unit. Returns the y below it.
 */
export function drawBand(doc, y, text) {
  doc
    .rect(MARGIN.left, y, CONTENT_WIDTH, 18)
    .fill(INK);

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#FFFFFF")
    .text(
      toPdfText(text),
      MARGIN.left + 6,
      y + 4.5,
      { width: CONTENT_WIDTH - 12 },
    );

  return y + 18;
}

/**
 * The grey column header row. Returns the y below it.
 */
export function drawTableHeader(
  doc,
  y,
  columns,
  positions = columnPositions(columns),
) {
  doc
    .rect(MARGIN.left, y, CONTENT_WIDTH, 18)
    .fill(COLOURS.headerBand);

  columns.forEach((column, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLOURS.strong)
      .text(
        column.label.toUpperCase(),
        positions[index] + CELL_PADDING,
        y + 5.5,
        {
          width: column.width - 2 * CELL_PADDING,
        },
      );
  });

  return y + 18;
}

/**
 * A horizontal rule across the content width.
 */
export function drawRule(doc, y, heavy = false) {
  doc
    .moveTo(MARGIN.left, y)
    .lineTo(MARGIN.left + CONTENT_WIDTH, y)
    .lineWidth(heavy ? 1 : 0.5)
    .strokeColor(
      heavy ? COLOURS.divider : COLOURS.hairline,
    )
    .stroke();
}

/**
 * Writes the footer on every page, now that the total is known, ends
 * the document and returns the bytes. `label` names the report.
 */
export function finishWithFooter(
  doc,
  finished,
  label,
) {
  const range = doc.bufferedPageRange();

  for (
    let index = 0;
    index < range.count;
    index += 1
  ) {
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
          `${footerLegal()} · ${BRAND.productName} · ${label}`,
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
