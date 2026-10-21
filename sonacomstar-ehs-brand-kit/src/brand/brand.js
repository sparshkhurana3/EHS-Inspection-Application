// Every Sona Comstar name, string and asset path the EHS app shows, in one place.
// Assets live in frontend/public/brand/, so they are served from /brand/.

const year = new Date().getFullYear();

export const BRAND = {
  companyName: 'Sona Comstar',
  // Keep the EHS app's existing product name here; only the company branding changes.
  productName: 'EHS',
  // Second line under the product name in the sidebar, auth panel and home header.
  tagline: 'Sona Comstar',
  documentTitle: (page) => (page ? `${page} · EHS · Sona Comstar` : 'EHS · Sona Comstar'),
  footerLegal: `© ${year} Sona Comstar`,
  ssoHint: 'Use your Sona Comstar Microsoft account to continue.',
  emailPlaceholder: 'name@sonacomstar.com',

  logo: {
    // Stacked logo (emblem over wordmark), as Sona Comstar supplies it.
    onDark: '/brand/logo/sona-comstar-logo-white.svg',
    onLight: '/brand/logo/sona-comstar-logo-ink.svg',
    // Emblem alone, for the brand tile that used to hold the monogram.
    emblemOnDark: '/brand/logo/sona-comstar-emblem-white.svg',
    emblemOnLight: '/brand/logo/sona-comstar-emblem-ink.svg',
  },
};
