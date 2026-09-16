export default function LoadingSpinner({
  message = "Loading...",
}) {
  return (
    <div
      className="loading-state"
      role="status"
      aria-live="polite"
    >
      <span
        className="loading-spinner"
        aria-hidden="true"
      />

      <span>{message}</span>
    </div>
  );
}