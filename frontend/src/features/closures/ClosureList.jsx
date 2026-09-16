import { formatDate } from "../../lib/errorMessage.js";

function ClosureCard({ closure, onOpen, variant }) {
  return (
    <li>
      <button
        type="button"
        className={`closure-list-item${
          variant ? ` closure-list-${variant}` : ""
        }`}
        onClick={() => onOpen(closure.id)}
      >
        <span className="closure-list-main">
          <strong>
            {closure.reportNumber ?? "Closure"}
          </strong>

          <span>
            {[
              closure.unitName,
              closure.zoneName,
              closure.areaName,
            ]
              .filter(Boolean)
              .join(" / ")}
          </span>
        </span>

        <span className="closure-list-meta">
          {/*
            * A returned closure shows the required "Open" chip, so it
            * needs a second marker or it looks identical to one that
            * was never touched.
            */}
          {closure.wasReturned ? (
            <span className="closure-returned-badge">
              Returned by EHS
            </span>
          ) : null}

          {variant === "lapsed" ? (
            <span className="closure-lapsed-badge">
              Lapsed
            </span>
          ) : null}

          <span>
            {closure.targetDate
              ? `Target ${formatDate(
                  closure.targetDate,
                )}`
              : `Raised ${formatDate(
                  closure.requestedAt,
                )}`}
          </span>

          <span className="closure-status-chip">
            {closure.displayStatus}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function ClosureList({
  closures,
  onOpen,
  variant,
  emptyMessage,
}) {
  if (closures.length === 0) {
    return (
      <p className="closure-empty-note">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="closure-list">
      {closures.map((closure) => (
        <ClosureCard
          key={closure.id}
          closure={closure}
          onOpen={onOpen}
          variant={variant}
        />
      ))}
    </ul>
  );
}
