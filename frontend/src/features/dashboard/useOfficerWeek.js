import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

import {
  fetchOfficerWeek,
} from "./dashboard.service.js";

/**
 * The week shown on the EHS Officer's card, and moving between weeks.
 *
 * It is used by DashboardPage rather than by the card, because the page
 * replaces everything with a spinner while the dashboard reloads and
 * the card's own state would be thrown away with it.
 *
 * Until the officer navigates, the week is the dashboard's default week
 * (initialWeek) and follows every dashboard reload. Once they have
 * moved to a week, that week stays on screen through dashboard reloads.
 * Every date comes from the server: the client never does date
 * arithmetic, and never pages through empty weeks.
 */
export default function useOfficerWeek(
  initialWeek,
) {
  /*
   * null means "the default week". It is set only once a request for a
   * chosen week has succeeded, so it always names the week on screen.
   */
  const [
    selectedWeekStart,
    setSelectedWeekStart,
  ] = useState(null);

  const [week, setWeek] =
    useState(initialWeek);

  const [seededFrom, setSeededFrom] =
    useState(initialWeek);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
   * Kept here rather than in the card so that a save's confirmation
   * survives the reload that follows it and any week navigation.
   */
  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  /*
   * Only the newest request may change the week, so a slow response
   * to an earlier click cannot overwrite the week asked for last.
   */
  const latestRequestRef = useRef(0);

  /*
   * Re-seeding while rendering, rather than in an effect, so the card
   * never paints the previous week for a frame after a dashboard
   * reload.
   */
  if (initialWeek !== seededFrom) {
    setSeededFrom(initialWeek);

    if (selectedWeekStart === null) {
      setWeek(initialWeek);
      setError("");
    }
  }

  const loadWeek = useCallback(
    async (weekStart) => {
      latestRequestRef.current += 1;

      const requestId =
        latestRequestRef.current;

      setLoading(true);
      setError("");

      try {
        const result =
          await fetchOfficerWeek({
            weekStart,
          });

        if (
          requestId ===
          latestRequestRef.current
        ) {
          setWeek(
            result?.officerWeek ?? null,
          );

          setSelectedWeekStart(
            weekStart ?? null,
          );
        }
      } catch (requestError) {
        if (
          requestId ===
          latestRequestRef.current
        ) {
          setError(
            getErrorMessage(
              requestError,
              "Unable to load the inspection week.",
            ),
          );
        }
      } finally {
        if (
          requestId ===
          latestRequestRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const goToWeek = useCallback(
    async (weekStart) => {
      if (!weekStart) {
        return;
      }

      await loadWeek(weekStart);
    },
    [loadWeek],
  );

  const goToPreviousWeek = useCallback(
    () =>
      goToWeek(
        week?.previousWeekStart,
      ),
    [goToWeek, week],
  );

  const goToNextWeek = useCallback(
    () =>
      goToWeek(week?.nextWeekStart),
    [goToWeek, week],
  );

  const goToCurrentWeek = useCallback(
    () =>
      goToWeek(
        week?.currentWeekStart,
      ),
    [goToWeek, week],
  );

  /*
   * Re-fetches the week on screen with this hook's own loading flag,
   * never the page spinner. Before any navigation that is the default
   * week, asked for without a weekStart.
   */
  const reload = useCallback(
    () => loadWeek(selectedWeekStart),
    [loadWeek, selectedWeekStart],
  );

  return {
    week,
    selectedWeekStart,
    loading,
    error,
    successMessage,
    setSuccessMessage,
    goToWeek,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    reload,
  };
}
