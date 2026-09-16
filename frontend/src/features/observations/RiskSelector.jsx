const RISK_OPTIONS = [
  {
    value: "HIGH",
    code: "H",
    label: "High",
    description:
      "Immediate or high-priority action.",
  },
  {
    value: "MEDIUM",
    code: "M",
    label: "Medium",
    description:
      "Important corrective action required.",
  },
  {
    value: "LOW",
    code: "L",
    label: "Low",
    description:
      "Lower-risk improvement opportunity.",
  },
];

export default function RiskSelector({
  value = "",
  disabled = false,
  onChange,
}) {
  function handleSelect(selectedRisk) {
    if (disabled) {
      return;
    }

    if (typeof onChange === "function") {
      onChange(selectedRisk);
    }
  }

  return (
    <fieldset
      className="observation-risk-fieldset"
      disabled={disabled}
    >
      <legend>
        Risk category
        <span
          className="required-marker"
          aria-hidden="true"
        >
          {" "}*
        </span>
      </legend>

      <div
        className="observation-risk-options"
        role="radiogroup"
        aria-label="Risk category"
      >
        {RISK_OPTIONS.map((riskOption) => {
          const selected =
            value === riskOption.value;

          const className = [
            "observation-risk-option",
            `observation-risk-${riskOption.value.toLowerCase()}`,
            selected
              ? "observation-risk-selected"
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={riskOption.value}
              type="button"
              className={className}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                handleSelect(
                  riskOption.value,
                );
              }}
            >
              <span
                className="observation-risk-code"
                aria-hidden="true"
              >
                {riskOption.code}
              </span>

              <span className="observation-risk-content">
                <strong>
                  {riskOption.label}
                </strong>

                <small>
                  {riskOption.description}
                </small>
              </span>

              <span
                className="observation-risk-selection"
                aria-hidden="true"
              >
                {selected ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <input
        type="hidden"
        name="riskCategory"
        value={value}
      />
    </fieldset>
  );
}