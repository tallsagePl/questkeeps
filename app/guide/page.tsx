import type { ReactNode } from 'react';
import { publicMetadata } from '@/lib/public-seo';
import PublicPageShell from '@/components/public-page-shell';
import CreateTripLink from '@/components/create-trip-link';
import styles from './guide.module.css';

export const metadata = publicMetadata(
  '/guide',
  'Как разобрать фотографии после поездки · QuestKeeps',
  'Как подключить папку Яндекс Диска, разложить фото по дням, добавить место съёмки, сравнить похожие кадры и отправить поездку одной ссылкой.',
);

function GuideStep({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className={styles.step}>
      <summary>
        <h2>
          {title}
          <span>{description}</span>
        </h2>
      </summary>
      <div className={styles.stepBody} id={id}>
        {children}
      </div>
    </details>
  );
}

export default function GuidePage() {
  return (
    <PublicPageShell>
      <main id="main-content" tabIndex={-1} className={styles.guide} lang="ru">
        <h1>Как разобрать фотографии после поездки</h1>
        <GuideStep
          id="dates"
          title="Разложить фото по дням"
          description="Выберите папку Яндекс Диска. Кадры сгруппируются по датам съёмки."
        >
          <p>
            Нажмите «Создать поездку», чтобы заполнить название, маршрут и даты.
            Войти или создать аккаунт можно при сохранении. Если нужны фото,
            выберите папку Яндекс Диска: за один вход можно войти в QuestKeeps и
            открыть выбор папки. Если не помните даты, попробуйте «Определить
            даты по фото и видео» и проверьте предложенный диапазон. После
            импорта откройте «Галерею» и выберите дату. На широком экране даты
            расположены слева от кадров, на телефоне — в плитках над кадрами.
          </p>
          <p>
            В <a href="/about#trip-example">примере «Три дня у Босфора»</a> фото
            из одной папки открываются по дням. На карте отмечены места съёмки,
            а дневник хранит историю прогулки. Такую поездку можно открыть
            друзьям одной ссылкой. Кадры без даты собраны в отдельной группе.
          </p>
          <CreateTripLink source="guide" className={styles.action}>
            Создать поездку
          </CreateTripLink>
        </GuideStep>
        <GuideStep
          id="map"
          title="Найти кадры на карте"
          description="Фото с GPS появятся там, где вы их сняли."
        >
          <p>
            На вкладке «Карта» отображаются кадры с координатами. Если снимка на
            карте нет, откройте его в галерее. Когда в файле нет GPS, место
            съёмки можно выбрать на карте вручную. На вкладке «Открытые места»
            проверьте, подходят ли достопримечательности, предложенные рядом с
            вашими кадрами.
          </p>
          <figure>
            <img
              src="/about/screenshots/ru-light-map.webp"
              alt="Вкладка «Карта» с местами съёмки в демонстрационной поездке QuestKeeps"
              width={1280}
              height={800}
              loading="lazy"
              decoding="async"
            />
            <figcaption>
              Карта демонстрационной поездки в QuestKeeps.
            </figcaption>
          </figure>
        </GuideStep>
        <GuideStep
          id="review"
          title="Разобрать похожие снимки"
          description="Сравните кадры и отметьте удачные звёздочкой."
        >
          <p>
            В «Разборе кадров» нажмите «Сравнить фото» или «Сравнить видео».
            Если вы сняли один вид несколько раз, откройте похожие кадры и
            выберите тот, где лучше получились люди или детали. Можно поставить
            звёздочку, повернуть фото или убрать его из архива. Оригинал
            останется на Яндекс Диске.
          </p>
        </GuideStep>
        <GuideStep
          id="share"
          title="Отправить поездку друзьям"
          description="Одна ссылка откроет фото, карту и дневник."
        >
          <p>
            Владелец и управляющий могут создать гостевую ссылку в разделе
            «Управление поездкой». По ней друзья увидят опубликованные кадры,
            карту и дневник без регистрации. Чтобы отправить несколько снимков,
            нажмите «Поделиться поездкой» и соберите пост или историю из
            избранного.
          </p>
          <p>
            Получатель может переслать ссылку. Когда она больше не нужна,
            отзовите доступ в настройках поездки. Уже скачанные файлы останутся
            у получателей.
          </p>
        </GuideStep>
        <CreateTripLink source="guide" className={`primary ${styles.create}`}>
          Создать поездку
        </CreateTripLink>
      </main>
    </PublicPageShell>
  );
}
