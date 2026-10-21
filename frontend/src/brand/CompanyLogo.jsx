import { BRAND } from './brand';

/**
 * The full Sona Comstar logo (emblem over wordmark).
 *   <CompanyLogo surface="dark" className="brand-company-logo-auth" />
 */
export default function CompanyLogo({ surface = 'dark', className = '' }) {
  const src = surface === 'dark' ? BRAND.logo.onDark : BRAND.logo.onLight;
  return <img className={`brand-company-logo ${className}`.trim()} src={src} alt={BRAND.companyName} />;
}
