import { cachedAreaWiki, cachedPlaceImage } from '../lib/place-client-cache';
import type * as Leaflet from 'leaflet';
export type AreaCandidate = {
  id: string;
  title: string;
  kind: 'street' | 'district';
  photoIds: string[];
  geometry: any;
  url: string;
};
export function suggestedMapAreas(
  L: typeof Leaflet,
  map: Leaflet.Map,
  candidates: AreaCandidate[],
  add: (id: string) => Promise<void>,
  t: (s: string) => string,
  wikiPath?: string,
  cacheScope = '',
  language: 'ru' | 'en' = 'ru',
) {
  const layers: Leaflet.GeoJSON[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) => Number(a.kind === 'street') - Number(b.kind === 'street'),
  )) {
    let hovered = false,
      focused = false;
    let group: Leaflet.GeoJSON;
    const paint = () =>
      group.setStyle({
        color: hovered || focused ? '#e5ae00' : '#adb4be',
        weight: candidate.kind === 'street' ? 5 : 2,
        opacity: 0.8,
        fillColor: hovered || focused ? '#ffd447' : '#b7bec8',
        fillOpacity: 0.15,
      });
    const displayName =
      language === 'en'
        ? t(candidate.kind === 'street' ? 'Улица' : 'Район')
        : candidate.title;
    const show = () => {
      const box = document.createElement('div');
      box.className = 'map-area-proposal';
      const title = document.createElement('strong');
      title.textContent = displayName;
      box.append(title);
      const preview = document.createElement('div');
      preview.className = 'map-area-wiki';
      preview.textContent = t('Ищем статью в Википедии…');
      box.append(preview);
      const count = document.createElement('p');
      count.textContent =
        t('Фотографий для привязки:') + ' ' + candidate.photoIds.length;
      box.append(count);
      const scope = document.createElement('p');
      scope.textContent = t(
        'Учитываются все даты поездки, даже если в календаре выбран один день.',
      );
      box.append(scope);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.textContent = t('Добавить место к фотографиям');
      box.append(button);
      const error = document.createElement('p');
      error.setAttribute('role', 'alert');
      box.append(error);
      button.addEventListener('click', async () => {
        button.disabled = true;
        error.textContent = '';
        try {
          await add(candidate.id);
          group.remove();
          map.closePopup();
        } catch (e) {
          error.textContent =
            e instanceof Error ? e.message : t('Не удалось добавить место');
          button.disabled = false;
        }
      });
      group
        .bindPopup(box, {
          maxWidth: Math.max(180, Math.min(280, map.getSize().x - 64)),
          maxHeight: 360,
          className: 'map-area-popup',
        })
        .openPopup();
      let active = true,
        imageUrl: string | undefined;
      group.once('popupclose', () => {
        active = false;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
      });
      if (wikiPath)
        void cachedAreaWiki(
          wikiPath + '/' + candidate.id + '/wiki?lang=' + language + '&v=4',
          cacheScope,
        )
          .then(async (info) => {
            if (!active) return;
            preview.replaceChildren();
            if (info.title) {
              title.textContent = info.title;
              group.eachLayer((path) => {
                const label = document.createElement('span');
                label.textContent = info.title;
                (path as Leaflet.Path).setTooltipContent(label);
                (path as Leaflet.Path)
                  .getElement()
                  ?.setAttribute(
                    'aria-label',
                    t('Добавить место') + ': ' + info.title,
                  );
              });
            }
            if (!info.url) {
              preview.textContent = t('Статья в Википедии не найдена');
              group.getPopup()?.update();
              return;
            }
            const link = document.createElement('a');
            link.href = info.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = t('Википедия') + ' ↗';
            link.title = info.title;
            const copy = document.createElement('div');
            copy.append(link);
            if (info.description) {
              const description = document.createElement('p');
              description.textContent = info.description;
              copy.append(description);
            }
            preview.append(copy);
            group.getPopup()?.update();
            if (info.image)
              try {
                const blob = await cachedPlaceImage(info.image, cacheScope);
                if (!active) return;
                imageUrl = URL.createObjectURL(blob);
                const image = document.createElement('img');
                image.src = imageUrl;
                image.alt = info.title;
                image.width = 64;
                image.height = 64;
                preview.prepend(image);
                group.getPopup()?.update();
              } catch {}
          })
          .catch(() => {
            if (active) {
              preview.textContent = t('Википедия временно недоступна');
              group.getPopup()?.update();
            }
          });
      else preview.remove();
      requestAnimationFrame(() => button.focus({ preventScroll: true }));
    };
    group = L.geoJSON(candidate.geometry, {
      pane:
        candidate.kind === 'street' ? 'suggestedStreets' : 'suggestedPlaces',
      bubblingMouseEvents: false,
      onEachFeature: (_f, path) => {
        const label = document.createElement('span');
        label.textContent = displayName;
        path.bindTooltip(label);
        path.on('mouseover', () => {
          hovered = true;
          paint();
        });
        path.on('mouseout', () => {
          hovered = false;
          paint();
        });
        path.on('click', show);
        path.on('add', () => {
          const el = (path as Leaflet.Path).getElement();
          if (!el) return;
          el.setAttribute('tabindex', '0');
          el.setAttribute('role', 'button');
          el.setAttribute(
            'aria-label',
            t('Добавить место') + ': ' + displayName,
          );
          el.setAttribute('data-area-id', candidate.id);
          el.addEventListener('focus', () => {
            focused = true;
            paint();
          });
          el.addEventListener('blur', () => {
            focused = false;
            paint();
          });
          el.addEventListener('keydown', (event: Event) => {
            const e = event as KeyboardEvent;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              show();
            }
          });
        });
      },
    }).addTo(map);
    paint();
    layers.push(group);
  }
  return () => layers.forEach((layer) => layer.remove());
}
