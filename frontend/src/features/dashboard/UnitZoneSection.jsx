import ZoneAssignmentRow from "./ZoneAssignmentRow.jsx";

/**
 * One unit's zones within the officer's single upcoming inspection
 * week card.
 */
export default function UnitZoneSection({
  unit,
  users,
  onSaveAssignment,
}) {
  return (
    <div className="unit-zone-section">
      <div className="unit-zone-section-heading">
        <span className="assignment-role-label">
          {unit.unitNumber
            ? `Unit ${unit.unitNumber}`
            : "Unit"}
        </span>

        <h4>{unit.unitName}</h4>

        <span className="dashboard-single-record">
          {unit.zones.length === 1
            ? "1 zone audit"
            : `${unit.zones.length} zone audits`}
        </span>
      </div>

      <div className="weekly-list-header">
        <span>Zone</span>
        <span>Date</span>
        <span>Auditor</span>
        <span>Auditee</span>
        <span>Status</span>
        <span />
      </div>

      <ul className="zone-assignment-list">
        {unit.zones.map((zone) => (
          <ZoneAssignmentRow
            key={zone.patrolId}
            zone={zone}
            users={users}
            onSaveAssignment={
              onSaveAssignment
            }
          />
        ))}
      </ul>
    </div>
  );
}
