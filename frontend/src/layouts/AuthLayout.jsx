import { Link } from "react-router-dom";

import { BRAND } from "../brand/brand.js";
import BrandMark from "../brand/BrandMark.jsx";
import CompanyLogo from "../brand/CompanyLogo.jsx";

export default function AuthLayout({
  title,
  description,
  children,
}) {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <section className="auth-information-panel">
          <div>
            <CompanyLogo
              surface="dark"
              className="brand-company-logo-auth"
            />

            <Link
              to="/"
              className="auth-brand"
            >
              <BrandMark
                className="auth-brand-mark"
                surface="dark"
              />

              <span>
                <strong>{BRAND.productName}</strong>
                <small>{BRAND.tagline}</small>
              </span>
            </Link>
          </div>

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
            {BRAND.footerLegal}
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