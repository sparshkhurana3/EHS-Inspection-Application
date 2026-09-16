import { Link } from "react-router-dom";

export default function AuthLayout({
  title,
  description,
  children,
}) {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <section className="auth-information-panel">
          <Link
            to="/"
            className="auth-brand"
          >
            <span className="auth-brand-mark">
              EHS
            </span>

            <span>
              <strong>EHS Inspection</strong>
              <small>
                Safety patrol and observation management
              </small>
            </span>
          </Link>

          <div className="auth-information-content">
            <span className="auth-information-label">
              Secure EHS Workspace
            </span>

            <h1>
              Improve safety through accountable inspections.
            </h1>

            <p>
              Plan patrols, record observations, assign
              corrective actions, and follow every finding
              through closure.
            </p>
          </div>

          <p className="auth-information-footer">
            Environmental Health and Safety Tool
          </p>
        </section>

        <main className="auth-form-panel">
          <div className="auth-form-container">
            <Link
              to="/"
              className="auth-back-link"
            >
              <span aria-hidden="true">←</span>
              Back to homepage
            </Link>

            <div className="auth-form-heading">
              <h2>{title}</h2>
              <p>{description}</p>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>)}