import type Database from 'better-sqlite3';

// Frozen compatibility data: later wording changes must not alter this migration.
const legacyErrors = [
  ['Сначала войдите в аккаунт', 'messages.pleaseSignInFirst'],
  ['Поездка не найдена', 'messages.tripNotFound'],
  ['Нет доступа к поездке', 'messages.youDoNotHaveAccessToThis'],
  [
    'Это действие доступно владельцу',
    'messages.thisActionIsOnlyAvailableToThe',
  ],
  ['Ссылка недействительна', 'messages.invalidLink'],
  [
    'Дата вне периода вашего участия',
    'messages.thisDateIsOutsideYourParticipationPeriod',
  ],
  ['Файл не найден', 'messages.fileNotFound'],
  ['Файл недоступен', 'profileFiles.fileUnavailable'],
  [
    'Слишком много попыток. Попробуйте позже',
    'messages.tooManyAttemptsPleaseTryAgainLater',
  ],
  ['Нет доступа', 'messages.accessDenied'],
  [
    'Ссылка подтверждения недействительна или истекла',
    'messages.theVerificationLinkIsInvalidOrHas',
  ],
  ['Этот email уже зарегистрирован', 'messages.thisEmailIsAlreadyRegistered'],
  [
    'Регистрация временно недоступна: почта не подключена',
    'messages.registrationIsTemporarilyUnavailableEmailDeliveryIs',
  ],
  ['Неверный email, никнейм или пароль', 'auth.invalidCredentials'],
  ['Участник не найден', 'messages.memberNotFound'],
  [
    'Владелец не может выйти из своей поездки',
    'messages.theOwnerCannotLeaveTheirOwnTrip',
  ],
  ['Запись не найдена', 'messages.entryNotFound'],
  [
    'Можно удалять только свои записи',
    'messages.youCanOnlyDeleteYourOwnEntries',
  ],
  ['Это чужой аккаунт', 'messages.thisAccountBelongsToSomeoneElse'],
  ['Выберите папку конкретной поездки', 'messages.chooseAFolderForThisTrip'],
  ['Выберите папку', 'messages.chooseAFolder'],
  ['Источник не найден', 'messages.sourceNotFound'],
  ['Маршрут не найден', 'messages.routeNotFound'],
  ['Пользователь не найден', 'tripDescription.userNotFound'],
  ['Пустой запрос', 'messages.emptyRequest'],
  ['Слишком большой запрос', 'messages.requestIsTooLarge'],
  ['Некорректный JSON', 'messages.invalidJson'],
  [
    'Период участия должен быть внутри поездки',
    'messages.participationDatesMustBeWithinTheTrip',
  ],
  ['Место не найдено', 'messages.placeNotFound'],
  ['Некорректный диапазон', 'messages.invalidRange'],
  ['Файл на Диске недоступен', 'messages.theFileIsUnavailableOnDrive'],
  [
    'Яндекс не вернул изображение миниатюры',
    'messages.yandexDidNotReturnAPreviewImage',
  ],
  [
    'Можно менять только свои фотографии',
    'messages.youCanOnlyEditYourOwnPhotos',
  ],
  [
    'Удалить место может автор или владелец',
    'messages.onlyTheAuthorOrTripOwnerCan',
  ],
  ['У фотографии нет координат', 'messages.thisPhotoHasNoCoordinates'],
  [
    'Подтвердить место может автор или владелец',
    'messages.onlyTheAuthorOrOwnerCanConfirm',
  ],
  [
    'Добавьте YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET в .env.local',
    'messages.setYandexClientIdAndYandexClient',
  ],
  ['Сначала войдите', 'messages.signInFirst'],
  [
    'Авторизация истекла. Повторите вход',
    'messages.authorizationExpiredPleaseSignInAgain',
  ],
  ['Аккаунт входа изменился', 'messages.theSignedInAccountHasChanged'],
  ['Нет кода авторизации', 'messages.authorizationCodeIsMissing'],
  [
    'Не удалось прочитать профиль Яндекса',
    'messages.couldNotReadYourYandexProfile',
  ],
  [
    'Сначала отключите текущий аккаунт Яндекса в профиле',
    'messages.disconnectYourCurrentYandexAccountInYour',
  ],
  [
    'Этот Яндекс уже подключён к другому пользователю',
    'messages.thisYandexAccountIsAlreadyLinkedTo',
  ],
  ['Аватарка не загружена', 'messages.noProfilePictureUploaded'],
  ['Гостевая ссылка недействительна', 'messages.thisGuestLinkIsNoLongerValid'],
  [
    'Приглашение истекло или уже использовано',
    'messages.invitationExpiredOrAlreadyUsed',
  ],
  ['Приглашение уже принято', 'messages.invitationAlreadyAccepted'],
  ['Вы уже владелец', 'messages.youAlreadyOwnThisTrip'],
  ['Вы уже участвуете', 'messages.youAlreadyParticipateInThisTrip'],
  ['Выберите папку с фотографиями', 'messages.chooseAFolderWithPhotos'],
  ['Метод не поддерживается', 'messages.methodNotSupported'],
  ['Неверный источник запроса', 'messages.invalidRequestOrigin'],
  [
    'Ссылка недействительна или истекла',
    'friends.thisLinkIsInvalidOrHasExpired',
  ],
  ['Это твоя ссылка для друзей', 'messages.thisIsYourOwnFriendInvitationLink'],
  ['Нельзя добавить себя в друзья', 'messages.youCannotAddYourselfAsAFriend'],
  [
    'У тебя уже есть заявка от этого человека',
    'messages.youAlreadyHaveARequestFromThis',
  ],
  [
    'Принять заявку может только её получатель',
    'messages.onlyTheRecipientCanAcceptARequest',
  ],
  ['Нет доступа к этому аккаунту', 'messages.youDoNotHaveAccessToThisAccount'],
  ['Анализ отменён', 'messages.analysisCancelled'],
  [
    'Анализ занял слишком много времени. Выберите папку меньшего размера',
    'messages.analysisTookTooLongChooseASmaller',
  ],
  [
    'В папке больше 5000 фотографий. Выберите папку одной поездки',
    'messages.theFolderHasOver5000Photos',
  ],
  [
    'Диск вернул неполный список файлов. Повторите анализ',
    'messages.driveReturnedAnIncompleteFileListTry',
  ],
  [
    'Сервис мест занят. Попробуй немного позже.',
    'messages.thePlaceServiceIsBusyPleaseTry',
  ],
  [
    'Сервис поиска мест временно недоступен. Попробуй немного позже.',
    'messages.thePlaceSearchServiceIsTemporarilyUnavailable',
  ],
  [
    'Сервис поиска мест перегружен. Попробуй немного позже.',
    'messages.thePlaceSearchServiceIsBusyTry',
  ],
  [
    'Не удалось получить описание места',
    'messages.couldNotLoadThePlaceDescription',
  ],
  [
    'Сервис поиска мест не смог обработать запрос.',
    'messages.thePlaceSearchServiceCouldNotProcess',
  ],
  [
    'Место должно находиться рядом с фотографией',
    'messages.thePlaceMustBeNearThePhoto',
  ],
  [
    'У этого места пока нет описания',
    'messages.noDescriptionIsAvailableForThisPlace',
  ],
  [
    'Выберите фотографию JPG, PNG или WebP',
    'messages.chooseAJpgPngOrWebpPhoto',
  ],
  ['Выберите фотографию', 'messages.chooseAPhoto'],
  ['Фотография должна быть не больше 5 МБ', 'profile.avatarTooLarge'],
  [
    'Не удалось прочитать фотографию. Выберите другой JPG, PNG или WebP',
    'messages.unableToReadThisPhotoChooseAnother',
  ],
  ['Выберите поездку', 'messages.chooseATrip'],
  ['Некорректная страница', 'messages.invalidPage'],
  ['Синхронизация перезапущена', 'messages.synchronizationWasRestarted'],
  [
    'Сканирование заняло слишком много времени. Выберите папку меньшего размера',
    'messages.scanningTookTooLongChooseASmaller',
  ],
  ['Одобрение источника отозвано', 'messages.sourceApprovalWasRevoked'],
  [
    'Период участия изменился. Повторите синхронизацию',
    'messages.participationDatesChangedRunSynchronizationAgain',
  ],
  [
    'Аккаунт Яндекса отключён. Подключите его снова в профиле',
    'messages.yandexAccountDisconnectedReconnectItInYour',
  ],
  ['Аккаунт не найден', 'messages.accountNotFound'],
  ['Переподключите аккаунт Яндекса', 'messages.reconnectYourYandexAccount'],
  [
    'Файл или папка на Диске не найдены',
    'messages.fileOrFolderNotFoundOnDrive',
  ],
  ['Неверный путь папки', 'messages.invalidFolderPath'],
  ['Неожиданный адрес файла', 'messages.unexpectedFileAddress'],
  ['Слишком много перенаправлений', 'messages.tooManyRedirects'],
  [
    'Для этого файла нет миниатюры',
    'messages.noThumbnailIsAvailableForThisFile',
  ],
  ['Неожиданный адрес миниатюры', 'messages.unexpectedPreviewAddress'],
  ['Ответ не найден', 'errors.replyNotFound'],
  ['Это сообщение уже удалено', 'errors.replyDeleted'],
  ['Нельзя отвечать на своё сообщение', 'errors.replyToSelf'],
  ['Можно удалять только свои ответы', 'errors.deleteOwnReplies'],
  ['Некорректный профиль Яндекса', 'errors.invalidYandexProfile'],
  [
    'Войдите в существующий профиль и подключите Яндекс',
    'errors.linkExistingAccount',
  ],
  ['Этот юзернейм уже занят', 'errors.usernameTaken'],
  ['Профиль не найден', 'errors.profileNotFound'],
  ['Выдели имя в одной строке', 'errors.singleLineMention'],
  ['Предложение места не найдено', 'errors.suggestionNotFound'],
  ['В этой области нет доступных фотографий', 'errors.areaHasNoPhotos'],
  ['Источник не одобрен', 'errors.sourceNotApproved'],
  [
    'Папка слишком большая для одного прохода. Выберите папку конкретной поездки',
    'errors.folderTooLarge',
  ],
  ['Источник должен быть папкой', 'errors.sourceMustBeFolder'],
  ['Неполный ответ Диска', 'errors.incompleteDiskResponse'],
] as const;

export function sourceMessageKeys(db: Database.Database) {
  const update = db.prepare('UPDATE sources SET error=? WHERE error=?');
  for (const [text, key] of legacyErrors) update.run(key, text);
}
