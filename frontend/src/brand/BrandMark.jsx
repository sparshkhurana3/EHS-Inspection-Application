import { BRAND } from './brand';

/**
 * The brand tile with the Sona Comstar emblem in place of the letter monogram.
 *
 * Pass the tile's existing class so its size, radius and fill stay exactly as they are:
 *   <BrandMark className="sidebar-brand-mark" surface="dark" />   // white tile on the ink sidebar
 *   <BrandMark className="home-brand-mark" surface="light" />     // ink tile on the white header
 *
 * surface is the colour of the area the tile sits on, matching the design reference:
 * "ink on white in dark areas, white on ink in light areas".
 */
export default function BrandMark({ className = '', surface = 'dark' }) {
  // A white tile on a dark surface carries the ink emblem, and the reverse.
  const src = surface === 'dark' ? BRAND.logo.emblemOnLight : BRAND.logo.emblemOnDark;
  return (
    <span className={`${className} brand-mark-has-emblem`.trim()} aria-hidden="true">
      <img className="brand-mark-emblem" src={src} alt="" />
    </span>
  );
}
