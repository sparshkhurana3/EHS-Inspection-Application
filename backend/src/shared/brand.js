/*
 * Every Sona Comstar name and asset the server prints, in one place.
 * Mirrors frontend/src/brand/brand.js; change both together.
 */
export const BRAND = Object.freeze({
  companyName: "Sona Comstar",
  productName: "EHS Inspection",

  /*
   * Black on white, so it prints crisply in black and white like the
   * rest of the reports.
   */
  reportLogoPath: new URL(
    "../assets/sona-comstar-report-header.png",
    import.meta.url,
  ),
});

export function footerLegal(date = new Date()) {
  return `© ${date.getUTCFullYear()} ${BRAND.companyName}`;
}
