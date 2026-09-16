/**
 * One place to turn an API error into something worth showing a user.
 * Previously five near-identical copies of this lived in the hooks and
 * had already drifted apart.
 */
export function getErrorMessage(
  error,
  fallback = "An unexpected error occurred.",
) {
  if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return (
      "Unable to connect to the EHS API. " +
      "Check that the backend is running."
    );
  }

  if (
    Array.isArray(error?.details) &&
    error.details.length > 0
  ) {
    const joined = error.details
      .map(
        (detail) =>
          detail?.message ?? detail?.msg,
      )
      .filter(Boolean)
      .join(" ");

    if (joined) {
      return joined;
    }
  }

  return error?.message || fallback;
}

const DATE_FORMATTER = new Intl.DateTimeFormat(
  "en-IN",
  {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
);

export function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? String(value)
    : DATE_FORMATTER.format(parsed);
}
