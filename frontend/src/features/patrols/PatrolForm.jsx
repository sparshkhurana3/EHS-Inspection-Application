function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function userLabel(user) {
  const name =
    user.fullName ?? user.username ?? `User ${user.id}`;

  return user.fullName && user.username
    ? `${user.fullName} (${user.username})`
    : name;
}

/**
 * Every option here comes from the API, scoped to the officer's own
 * location. Nothing is hardcoded: adding a unit, zone or area in the
 * database is enough for it to appear.
 */
export default function PatrolForm({
  location,
  units,
  zonesForUnit,
  selectedZone,
  users,
  values,
  submitting,
  onFieldChange,
  onSubmit,
  onCancel,
}) {
  const areas = selectedZone?.areas ?? [];

  const auditeeOptions = users.filter(
    (user) =>
      String(user.id) !==
      String(values.auditorId),
  );

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="patrol-form-card">
      <header className="observation-section-header">
        <div>
          <h2>Schedule an audit</h2>

          <p>
            Location:{" "}
            {location?.name ?? "Not set"}
          </p>
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          aria-label="Close the scheduling form"
        >
          ×
        </button>
      </header>

      <form noValidate onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="scheduledDate">
            Audit date
          </label>

          <input
            id="scheduledDate"
            type="date"
            min={todayValue()}
            value={values.scheduledDate}
            disabled={submitting}
            onChange={(event) =>
              onFieldChange(
                "scheduledDate",
                event.target.value,
              )
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="unitId">Unit</label>

          {units.length === 0 ? (
            <p className="closure-empty-note">
              No units are configured for this
              location.
            </p>
          ) : (
            <select
              id="unitId"
              value={values.unitId}
              disabled={submitting}
              onChange={(event) =>
                onFieldChange(
                  "unitId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Select the unit
              </option>

              {units.map((unit) => (
                <option
                  key={unit.id}
                  value={unit.id}
                >
                  {unit.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="zoneId">Zone</label>

          <select
            id="zoneId"
            value={values.zoneId}
            disabled={
              submitting || !values.unitId
            }
            onChange={(event) =>
              onFieldChange(
                "zoneId",
                event.target.value,
              )
            }
          >
            <option value="">
              {values.unitId
                ? "Select the zone"
                : "Select a unit first"}
            </option>

            {zonesForUnit.map((zone) => (
              <option
                key={zone.id}
                value={zone.id}
              >
                {zone.name}
              </option>
            ))}
          </select>

          {values.unitId &&
          zonesForUnit.length === 0 ? (
            <p className="closure-empty-note">
              No zones are configured for this
              unit.
            </p>
          ) : null}
        </div>

        {/*
          * A patrol covers the whole zone, so the areas are shown as
          * confirmation of what the auditor will walk rather than
          * being chosen here. The auditor names the specific area when
          * filing the observation.
          */}
        <div className="form-field">
          <span id="area-details-label">
            Area details
          </span>

          {selectedZone ? (
            areas.length > 0 ? (
              <ul
                className="patrol-area-list"
                aria-labelledby="area-details-label"
              >
                {areas.map((area) => (
                  <li key={area.id}>
                    {area.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="closure-empty-note">
                No areas are configured for this
                zone, so an audit cannot be
                scheduled for it.
              </p>
            )
          ) : (
            <p className="closure-empty-note">
              Select a zone to see its areas.
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="auditorId">
            Auditor
          </label>

          {users.length === 0 ? (
            <p className="closure-empty-note">
              No other users are registered at
              this location.
            </p>
          ) : (
            <select
              id="auditorId"
              value={values.auditorId}
              disabled={submitting}
              onChange={(event) =>
                onFieldChange(
                  "auditorId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Select the auditor
              </option>

              {users.map((user) => (
                <option
                  key={user.id}
                  value={user.id}
                >
                  {userLabel(user)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="auditeeId">
            Auditee
          </label>

          <select
            id="auditeeId"
            value={values.auditeeId}
            disabled={
              submitting || !values.auditorId
            }
            onChange={(event) =>
              onFieldChange(
                "auditeeId",
                event.target.value,
              )
            }
          >
            <option value="">
              {values.auditorId
                ? "Select the auditee"
                : "Select an auditor first"}
            </option>

            {auditeeOptions.map((user) => (
              <option
                key={user.id}
                value={user.id}
              >
                {userLabel(user)}
              </option>
            ))}
          </select>
        </div>

        <div className="closure-form-actions">
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
              units.length === 0 ||
              users.length === 0
            }
          >
            {submitting
              ? "Scheduling..."
              : "Schedule audit"}
          </button>
        </div>
      </form>
    </section>
  );
}
