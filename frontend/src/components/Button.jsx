import {
  Link,
} from "react-router-dom";

export default function Button({
  children,
  to,
  variant = "primary",
  type = "button",
  disabled = false,
  className = "",
  onClick,
}) {
  const buttonClassName = [
    "button",
    `button-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link
        to={to}
        className={buttonClassName}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={buttonClassName}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}