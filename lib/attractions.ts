type Page = {
  title?: string;
  categories?: { title: string }[];
  terms?: { description?: string[] };
};
const physical =
  /музе[йяеи]|памятник|мемориал|монумент|мечет|собор|церков|храм|базилик|синагог|монастыр|дворец|дворцы|крепост|замок|башн|ворота|колонна|фонтан|амфитеатр|акведук|мавзоле|усадьб|археолог|смотровая площадка|ботанический сад|национальный парк|водопад|пещер|заповедник/iu;
const attractionCategories =
  /достопримечательност|объекты культурного наследия|памятники архитектуры|архитектурные памятники|исторические здания|музеи|музеев|памятники|мемориал|монумент|мечети|соборы|церкви|храмы|синагог|монастыр|дворцы|крепости|замки|башни|колонны|фонтаны|акведуки|мавзолеи|усадьбы|археолог|смотровые площадки|ботанические сады|национальные парки|водопады|пещеры|заповедники|театры|оперные|исторические мосты|фуникул[её]ры/iu;
const eventTitle =
  /^(катастрофа|авиакатастрофа|крушение|авария|теракт|террористический акт|взрыв|пожар|сражение|битва|осада|землетрясение|наводнение|убийство|расстрел|рейс \d)/iu;
const administrative =
  /\((?:район|округ|муниципалитет|поселение|область|провинция)(?:\s|\))|^(?:район|округ|муниципалитет|поселение|область|провинция)\s/iu;
const transportTitle =
  /станци[яи] метро|станци[яи] метрополитена|железнодорожная станция|железнодорожный вокзал|автовокзал|автостанци|аэропорт|аэродром|транспортно-пересадочный узел/iu;
const transportDescription =
  /станци[яи].{0,60}метро|станци[яи] метро|железнодорожн.{0,20}станци|железнодорожн.{0,20}вокзал|автовокзал|автостанци|аэропорт|аэродром|остановочный пункт|транспортно-пересадочный узел/iu;
const transportCategories =
  /станции.{0,40}метро|станции мелкого заложения|станции глубокого заложения|колонные станции|пилонные станции|железнодорожные станции|железнодорожные платформы|железнодорожные вокзалы|аэропорты|аэродромы|автостанции|автовокзалы/iu;
const transportExhibit = /музе[йяеи]|памятник|мемориал|монумент/iu;
function ordinaryTransport(title: string) {
  return transportTitle.test(title) && !transportExhibit.test(title);
}
const historicArea =
  /историческ[а-яё]*\s+(?:городск[а-яё]*\s+)?(?:район|квартал|центр)|стар(?:ый|ого|ые|ых)\s+(?:город|квартал)/iu;
export function isAttraction(page: Page): boolean {
  const title = page.title || '';
  if (clearlyNotAttraction(title)) return false;
  const description = (page.terms?.description || []).join(' ');
  const categories = (page.categories || [])
    .map((category) => category.title.replace(/^Категория:/, ''))
    .join(' | ');
  if (
    !transportExhibit.test(title) &&
    (transportDescription.test(description) ||
      transportCategories.test(categories))
  )
    return false;
  if (historicArea.test(title + ' | ' + description + ' | ' + categories))
    return true;
  if (administrative.test(title)) return false;
  // A memorial to an event is a physical sight; the event article itself is not.
  if (physical.test(title)) return true;
  if (
    /^(?:авиационн.{0,10}происшеств|авиакатастроф|катастроф|историческ.{0,5}событ|административн|район\b|район |муниципалитет|улица |улица в|улица,|автомобильная дорог)/iu.test(
      description,
    )
  )
    return false;
  if (
    /авиационные происшествия|авиакатастрофы|террористические акты|катастрофы|сражения|битвы|административные единицы|районы Москвы|районы Стамбула/iu.test(
      categories,
    )
  )
    return false;
  return (
    attractionCategories.test(categories) ||
    attractionCategories.test(description)
  );
}
export function clearlyNotAttraction(title: string) {
  return eventTitle.test(title) || ordinaryTransport(title);
}
export function obviousAttraction(title: string) {
  return (
    !clearlyNotAttraction(title) &&
    !administrative.test(title) &&
    physical.test(title)
  );
}
