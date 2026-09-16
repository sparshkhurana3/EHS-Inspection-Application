const LOCATION_OPTIONS = [
  "Gurugram",
  "Manesar",
  "Chennai",
  "Pune",
  "China",
];

const UNIT_OPTIONS = [
  {
    value: "1",
    label: "Unit I",
  },
  {
    value: "2",
    label: "Unit II",
  },
  {
    value: "3",
    label: "Unit III",
  },
  {
    value: "4",
    label: "Unit IV",
  },
  {
    value: "5",
    label: "Unit V",
  },
];

const ZONE_OPTIONS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
];

const AREA_DETAIL_OPTIONS = [
  "ETP area",
  "Maintenance Store",
  "Utility",
  "Forge Shop",
  "Machine shop",
  "Heat Treatment",
  "Die Shop",
  "Tool Shop",
  "OSP Store",
];

function getTodayValue() {
  const currentDate = new Date();

  const year =
    currentDate.getFullYear();

  const month =
    String(
      currentDate.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      currentDate.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getUserLabel(user) {
  const fullName =
    user.fullName ??
    user.full_name ??
    user.name ??
    "";

  const username =
    user.username ?? "";

  if (fullName && username) {
    return `${fullName} (${username})`;
  }

  return (
    fullName ||
    username ||
    `User ${user.id}`
  );
}

export default function PatrolForm({
  formValues,
  auditors,
  auditees,
  submitting,
  onFieldChange,
  onSubmit,
  onCancel,
}) {
  function updateField(
    fieldName,
    event,
  ) {
    if (
      typeof onFieldChange === "function"
    ) {
      onFieldChange(
        fieldName,
        event.target.value,
      );
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (
      typeof onSubmit === "function"
    ) {
      onSubmit();
    }
  }

  return (
    <form
      className="patrol-planning-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="patrol-planning-form-header">
        <div>
          <span className="dashboard-eyebrow">
            New patrol assignment
          </span>

          <h2>Schedule an Audit</h2>

          <p>
            Select the audit location, work
            area, date, auditor, and auditee.
          </p>
        </div>

        <button
          type="button"
          className="patrol-planning-close"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close scheduling form"
        >
          ×
        </button>
      </div>

      <div className="patrol-planning-grid">
        <div className="patrol-form-field">
          <label htmlFor="patrol-location">
            Location
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-location"
            value={formValues.location}
            onChange={(event) => {
              updateField(
                "location",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select location
            </option>

            {LOCATION_OPTIONS.map(
              (location) => (
                <option
                  key={location}
                  value={location}
                >
                  {location}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-unit">
            Unit
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-unit"
            value={formValues.unit}
            onChange={(event) => {
              updateField(
                "unit",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select unit
            </option>

            {UNIT_OPTIONS.map(
              (unit) => (
                <option
                  key={unit.value}
                  value={unit.value}
                >
                  {unit.label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-zone">
            Zone
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-zone"
            value={formValues.zone}
            onChange={(event) => {
              updateField(
                "zone",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select zone
            </option>

            {ZONE_OPTIONS.map(
              (zone) => (
                <option
                  key={zone}
                  value={zone}
                >
                  Zone {zone}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-area-detail">
            Area detail
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-area-detail"
            value={formValues.areaDetail}
            onChange={(event) => {
              updateField(
                "areaDetail",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select area
            </option>

            {AREA_DETAIL_OPTIONS.map(
              (areaDetail) => (
                <option
                  key={areaDetail}
                  value={areaDetail}
                >
                  {areaDetail}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-scheduled-date">
            Scheduled date
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <input
            id="patrol-scheduled-date"
            type="date"
            min={getTodayValue()}
            value={
              formValues.scheduledDate
            }
            onChange={(event) => {
              updateField(
                "scheduledDate",
                event,
              );
            }}
            disabled={submitting}
            required
          />
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-auditor">
            Auditor name
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-auditor"
            value={formValues.auditorId}
            onChange={(event) => {
              updateField(
                "auditorId",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select auditor
            </option>

            {auditors.map((user) => (
              <option
                key={user.id}
                value={user.id}
              >
                {getUserLabel(user)}
              </option>
            ))}
          </select>

          {auditors.length === 0 && (
            <small>
              No users with the Auditor role
              are available.
            </small>
          )}
        </div>

        <div className="patrol-form-field">
          <label htmlFor="patrol-auditee">
            Auditee name
            <span aria-hidden="true">
              {" "}*
            </span>
          </label>

          <select
            id="patrol-auditee"
            value={formValues.auditeeId}
            onChange={(event) => {
              updateField(
                "auditeeId",
                event,
              );
            }}
            disabled={submitting}
            required
          >
            <option value="">
              Select auditee
            </option>

            {auditees.map((user) => (
              <option
                key={user.id}
                value={user.id}
              >
                {getUserLabel(user)}
              </option>
            ))}
          </select>

          {auditees.length === 0 && (
            <small>
              No users with the Auditee role
              are available.
            </small>
          )}
        </div>
      </div>

      <div className="patrol-planning-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="button button-primary"
          disabled={
            submitting ||
            auditors.length === 0 ||
            auditees.length === 0
          }
        >
          {submitting
            ? "Scheduling Audit..."
            : "Schedule Audit"}
        </button>
      </div>
    </form>
  );
}