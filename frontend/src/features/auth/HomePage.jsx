import Button from "../../components/Button.jsx";

function EhsBrand() {
  return (
    <div className="ehs-brand">
      <div
        className="ehs-brand-mark"
        aria-hidden="true"
      >
        EHS
      </div>

      <div>
        <strong className="ehs-brand-name">
          EHS Inspection
        </strong>

        <span className="ehs-brand-tagline">
          Safety patrol and observation management
        </span>
      </div>
    </div>
  );
}

function FeatureCard({
  number,
  title,
  description,
}) {
  return (
    <article className="home-feature-card">
      <span
        className="home-feature-number"
        aria-hidden="true"
      >
        {number}
      </span>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-container home-header-content">
          <EhsBrand />

          <span className="home-header-label">
            Environmental Health and Safety
          </span>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-hero-decoration home-decoration-left" />
          <div className="home-hero-decoration home-decoration-right" />

          <div className="home-container home-hero-grid">
            <div className="home-hero-content">
              <span className="home-eyebrow">
                Digital Safety Patrol Management
              </span>

              <h1>
                Build a safer workplace through
                better inspections
              </h1>

              <p className="home-hero-description">
                Schedule safety patrols, record workplace
                observations, assign corrective actions, and
                monitor every finding through approval and
                closure.
              </p>

              <div className="home-actions">
                <Button
                  to="/sign-in"
                  variant="primary"
                >
                  Sign in
                  <span
                    className="button-arrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Button>

                <Button
                  to="/sign-up"
                  variant="secondary"
                >
                  Sign up
                </Button>
              </div>

              <div className="home-security-note">
                <span
                  className="home-security-icon"
                  aria-hidden="true"
                >
                  ✓
                </span>

                <span>
                  Controlled access for EHS Officers,
                  auditors, auditees, and authorized
                  stakeholders.
                </span>
              </div>
            </div>

            <div
              className="home-workflow-card"
              aria-label="EHS inspection workflow summary"
            >
              <div className="workflow-card-header">
                <div>
                  <span>Inspection workflow</span>
                  <h2>From patrol to closure</h2>
                </div>

                <span className="workflow-status">
                  Controlled
                </span>
              </div>

              <div className="workflow-list">
                <div className="workflow-item">
                  <span className="workflow-step">1</span>

                  <div>
                    <strong>Plan patrols</strong>
                    <p>
                      Schedule Unit- and Zone-wise weekly
                      safety inspections.
                    </p>
                  </div>
                </div>

                <div className="workflow-line" />

                <div className="workflow-item">
                  <span className="workflow-step">2</span>

                  <div>
                    <strong>Capture observations</strong>
                    <p>
                      Record unsafe acts, unsafe conditions,
                      photographs, and risk categories.
                    </p>
                  </div>
                </div>

                <div className="workflow-line" />

                <div className="workflow-item">
                  <span className="workflow-step">3</span>

                  <div>
                    <strong>Complete corrective actions</strong>
                    <p>
                      Assign action plans and track findings
                      through EHS approval and closure.
                    </p>
                  </div>
                </div>
              </div>

              <div className="workflow-card-footer">
                <span>Auditable</span>
                <span>Accountable</span>
                <span>Traceable</span>
              </div>
            </div>
          </div>
        </section>

        <section className="home-features-section">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="home-eyebrow">
                Application capabilities
              </span>

              <h2>
                One workspace for the complete inspection
                lifecycle
              </h2>

              <p>
                The application connects safety planning,
                field observations, corrective actions, and
                management oversight.
              </p>
            </div>

            <div className="home-feature-grid">
              <FeatureCard
                number="01"
                title="Weekly safety patrols"
                description="Plan recurring inspections based on the assigned Unit, Zone, auditor, auditee, and inspection date."
              />

              <FeatureCard
                number="02"
                title="Observation reporting"
                description="Capture unsafe acts and unsafe conditions with descriptions, supporting photographs, and risk categories."
              />

              <FeatureCard
                number="03"
                title="Corrective-action closure"
                description="Send findings to auditees, record proposed actions, review closure responses, and retain a complete status history."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-container home-footer-content">
          <p>
            Environmental Health and Safety Inspection
            Application
          </p>

          <p>
            Safety · Accountability · Continuous improvement
          </p>
        </div>
      </footer>
    </div>
  );
}