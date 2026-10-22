export type RouteCity = {
  name: string;
  country: string;
  distanceKm: number;
  names?: Partial<Record<'ru' | 'en', string>>;
};

export function routeLabel(route: RouteCity[], language: 'ru' | 'en') {
  if (!route.length) return null;
  const regions = new Intl.DisplayNames([language], { type: 'region' });
  const cities = route
    .slice(0, 5)
    .map((city) => city.names?.[language] || city.name)
    .join(' → ');
  const countries = [
    ...new Set(route.map((city) => regions.of(city.country) || city.country)),
  ].join(', ');
  return (cities + ' || ' + countries).slice(0, 160);
}
