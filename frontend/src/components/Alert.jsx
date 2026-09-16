export default function Alert({
  type = "error",
  title,
  children,
}) {
  const className = [
    "alert",
    `alert-${type}`,
  ].join(" ");

  const role =
    type === "error" ? "alert" : "status";

  return (
    <div
      className={className}
      role={role}
    >
      {title && (
        <strong className="alert-title">
          {title}
        </strong>
      )}

      <div className="alert-content">
        {children}
      </div>
    </div>
  );
}