export const driveIconPaths = [
  'M6 6h12l4 8-4 4H6l-4-4 4-8Z',
  'M2 14h20',
  'M7 10h10',
];
export const driveIconSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#3448f5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="12" fill="#ffffff" stroke="none"/>' +
  driveIconPaths.map((d) => '<path d="' + d + '"/>').join('') +
  '</svg>';
