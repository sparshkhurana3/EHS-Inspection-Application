import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import ReportHeader from "./ReportHeader.jsx";
import ReportToolbar from "./ReportToolbar.jsx";
import WeeklyReportView from "./WeeklyReportView.jsx";
import YearlyReportView from "./YearlyReportView.jsx";
import useReport from "./useReport.js";
import useReportOptions from "./useReportOptions.js";

import { formatFiscalYear } from "./reportFormat.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

/**
 * The EHS Officer's Report page: choose a weekly or yearly report and a
 * period, generate it as interactive HTML in the page, or download the
 * full report as a PDF.
 *
 * The generated report's type and period live in the query string
 * (?type=weekly&week=2026-09-28, ?type=yearly&year=2026), so a report is
 * linkable and the back button returns to the previous one.
 */
export default function ReportsPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const options = useReportOptions();
  const reportState = useReport();

  const { generate } = reportState;

  const urlType = searchParams.get("type");
  const urlWeek = searchParams.get("week");
  const urlYear = searchParams.get("year");

  const [tab, setTab] = useState(
    urlType === "yearly" ? "yearly" : "weekly",
  );

  const [selectedWeek, setSelectedWeek] =
    useState(urlWeek ?? "");

  const [selectedYear, setSelectedYear] =
    useState(urlYear ?? "");

  const [jumpWeek, setJumpWeek] = useState("");
  const [jumpYear, setJumpYear] = useState("");

  /* Photographs are in the weekly PDF unless the officer opts out. */
  const [includePhotos, setIncludePhotos] =
    useState(true);

  /*
   * A week reached by number may be older than the picker's list. It
   * is remembered here so the picker can still show it.
   */
  const [customWeek, setCustomWeek] =
    useState(null);

  /*
   * The report the page already shows, as "type:period", so that the
   * URL effect below does not load it a second time.
   */
  const loadedKey = useRef("");

  const effectiveWeek =
    selectedWeek ||
    options.weeks[0]?.weekStart ||
    "";

  const effectiveYear =
    selectedYear ||
    String(options.years[0]?.year ?? "");

  const pickerWeeks =
    customWeek &&
    !options.weeks.some(
      (week) =>
        week.weekStart === customWeek.weekStart,
    )
      ? [customWeek, ...options.weeks]
      : options.weeks;

  function showResult(result) {
    if (!result) {
      return;
    }

    if (result.type === "WEEKLY") {
      loadedKey.current = `weekly:${result.weekStart}`;

      setSelectedWeek(result.weekStart);

      setCustomWeek({
        weekStart: result.weekStart,
        weekEnd: result.weekEnd,
        fiscalWeek: result.fiscalWeek,
        fiscalYear: result.fiscalYear,
      });

      setJumpWeek("");
      setJumpYear("");

      setSearchParams({
        type: "weekly",
        week: result.weekStart,
      });

      return;
    }

    loadedKey.current = `yearly:${result.year}`;

    setSelectedYear(String(result.year));

    setSearchParams({
      type: "yearly",
      year: String(result.year),
    });
  }

  /*
   * Opening a report link, or pressing Back to one, loads that report.
   * Generating from the toolbar updates the URL itself and records the
   * key first, so it is not loaded twice.
   */
  useEffect(() => {
    const key =
      urlType === "weekly" && urlWeek
        ? `weekly:${urlWeek}`
        : urlType === "yearly" && urlYear
          ? `yearly:${urlYear}`
          : "";

    if (!key || key === loadedKey.current) {
      return;
    }

    loadedKey.current = key;

    if (urlType === "weekly") {
      setTab("weekly");
      setSelectedWeek(urlWeek);

      generate("weekly", {
        weekStart: urlWeek,
      }).then((result) => {
        if (result) {
          setCustomWeek({
            weekStart: result.weekStart,
            weekEnd: result.weekEnd,
            fiscalWeek: result.fiscalWeek,
            fiscalYear: result.fiscalYear,
          });
        }
      });

      return;
    }

    setTab("yearly");
    setSelectedYear(urlYear);

    generate("yearly", { year: urlYear });
  }, [urlType, urlWeek, urlYear, generate]);

  function getParams() {
    if (tab === "yearly") {
      return effectiveYear
        ? { year: effectiveYear }
        : null;
    }

    if (jumpWeek !== "" && jumpYear !== "") {
      return {
        fiscalYear: jumpYear,
        fiscalWeek: jumpWeek,
      };
    }

    return effectiveWeek
      ? { weekStart: effectiveWeek }
      : null;
  }

  async function handleGenerate() {
    const params = getParams();

    if (!params) {
      return;
    }

    showResult(
      await generate(tab, params),
    );
  }

  function handleDownload() {
    const params = getParams();

    if (!params) {
      return;
    }

    if (tab === "yearly") {
      reportState.download(
        "yearly",
        params,
        `yearly-inspection-report-fy${formatFiscalYear(
          params.year,
        )}.pdf`,
      );

      return;
    }

    const week = pickerWeeks.find(
      (entry) =>
        entry.weekStart === params.weekStart,
    );

    const fileName = params.fiscalWeek
      ? `weekly-inspection-report-fy${formatFiscalYear(
          params.fiscalYear,
        )}-w${pad(params.fiscalWeek)}.pdf`
      : week
        ? `weekly-inspection-report-fy${formatFiscalYear(
            week.fiscalYear,
          )}-w${pad(week.fiscalWeek)}.pdf`
        : "weekly-inspection-report.pdf";

    reportState.download(
      "weekly",
      includePhotos
        ? params
        : { ...params, includePhotos: "false" },
      fileName,
    );
  }

  const visibleReport =
    reportState.report &&
    reportState.report.type ===
      tab.toUpperCase()
      ? reportState.report
      : null;

  const currentYear =
    options.years.length > 0
      ? Math.max(
          ...options.years.map(
            (entry) => entry.year,
          ),
        )
      : new Date().getFullYear();

  if (options.loading) {
    return (
      <LoadingSpinner message="Loading reports..." />
    );
  }

  return (
    <section className="report-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS Officer workflow
          </span>

          <h1>Reports</h1>

          <p>
            {options.location
              ? `Inspection reports for ${options.location.name}, viewable here and downloadable as PDF.`
              : "Inspection reports, viewable here and downloadable as PDF."}
          </p>
        </div>
      </header>

      {options.error ? (
        <Alert
          type="error"
          title="Unable to load the report options"
        >
          {options.error}
        </Alert>
      ) : null}

      <ReportToolbar
        tab={tab}
        onTabChange={setTab}
        weeks={pickerWeeks}
        years={options.years}
        selectedWeek={effectiveWeek}
        selectedYear={effectiveYear}
        currentYear={currentYear}
        onSelectWeek={(value) => {
          setSelectedWeek(value);
          setJumpWeek("");
          setJumpYear("");
        }}
        onSelectYear={setSelectedYear}
        jumpWeek={jumpWeek}
        jumpYear={jumpYear}
        onJumpWeekChange={setJumpWeek}
        onJumpYearChange={setJumpYear}
        canGenerate={getParams() !== null}
        generating={reportState.generating}
        downloading={reportState.downloading}
        includePhotos={includePhotos}
        onIncludePhotosChange={setIncludePhotos}
        onGenerate={handleGenerate}
        onDownload={handleDownload}
        onDownloadSpreadsheet={() =>
          reportState.downloadSpreadsheet(
            `zone-by-week-report-${new Date()
              .toISOString()
              .slice(0, 10)}.xlsx`,
          )
        }
        downloadingSpreadsheet={
          reportState.downloadingSpreadsheet
        }
      />

      {reportState.error ? (
        <Alert
          type="error"
          title="Unable to produce the report"
        >
          {reportState.error}
        </Alert>
      ) : null}

      {reportState.generating ? (
        <LoadingSpinner message="Generating the report..." />
      ) : visibleReport ? (
        <div className="report-sheet">
          <ReportHeader report={visibleReport} />

          {visibleReport.type === "WEEKLY" ? (
            <WeeklyReportView
              key={visibleReport.weekStart}
              report={visibleReport}
            />
          ) : (
            <YearlyReportView
              key={visibleReport.year}
              report={visibleReport}
            />
          )}
        </div>
      ) : reportState.error ? null : (
        <p className="closure-empty-note">
          {tab === "weekly"
            ? "Choose a week and select Generate report."
            : "Choose a year and select Generate report."}
        </p>
      )}
    </section>
  );
}
