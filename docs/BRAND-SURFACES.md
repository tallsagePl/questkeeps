# QuestKeeps: where the brand lives

Use this inventory whenever changing the logo, colors, typography or product voice. The website, emails, bot and repository represent the same product. A redesign is incomplete until these surfaces are reviewed together.

## Source of truth

- `DESIGN.md`: Cobalt Clear and Night Quest, local Onest font and existing product direction.
- `app/theme.css`: light/dark color roles, spacing, component geometry and responsive behavior. `app/globals.css` contains the shared base styles.
- `public/brand/questkeeps-{blue,white,black}.svg`: QK monogram variants; preserve the directional arrows.
- `public/brand/questkeeps-icon.svg`, `questkeeps-icon.png`, `questkeeps-avatar.png`: icon and avatar sources/exports.

## Website

- `components/brand.tsx`: header/footer wordmark and monogram. `components/site-footer.tsx` and `components/social-shell.tsx`: shared navigation and footer links.
- Landing/login, About and its screenshot stack, trip gallery, map, journal, participants, profile/friends, guest trip, invitation, verification and error screens all use the shared visual system.
- `app/privacy/page.tsx`: public RU + EN policy, readable without sign-in or JavaScript. Footer wording is localized, while both policy versions remain visible.
- `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/manifest.webmanifest`: favicon, Apple icon, social preview and install metadata. Check the actual route source when replacing an export.
- `lib/i18n/ru.json` and `en.json`: product copy, navigation and privacy text. Keep keys and meaning aligned.

## Transactional email

- `lib/verification-email.ts`: Russian/English header, inline CID logo, button, fallback link and footer. Email colors and HTML do not inherit website CSS; update them explicitly.
- `public/brand/questkeeps-avatar.png`: email brand avatar source. Review legibility in email clients, including dark mode and image blocking.
- `EMAIL_FROM` and `EMAIL_SUPPORT_URL`: private deployment settings controlling the sender display and support link. Preserve the working domain and actual bot URL.
- `public/brand/questkeeps-bimi.svg`: prepared BIMI asset. Gmail sender-avatar display is not activated by this file alone; certificate/provider setup is separate.

## Telegram

- `public/brand/telegram-avatar.png`: square 1024×1024 Botpic; test a circular crop.
- `public/brand/telegram-description.png` and `.svg`: 640×360 description image and editable vector source.
- `scripts/setup-telegram.ts`: name, About/description and commands set through the Bot API.
- `lib/telegram.ts`: greeting, acknowledgments, admin menu, feedback review and registration notification copy.
- BotFather stores the live Botpic, description image and Privacy Policy URL separately. Replacing files in Git does not upload them to Telegram. Use https://questkeeps.ru/privacy for the public policy.
- Never publish the bot token or numeric administrator ID. Keep one active polling worker; disable local polling before enabling production.

## Repository and documentation

- `README.md`, `README.ru.md`: bilingual product story, brand logo, version, feature list and links.
- `docs/screenshots/`: English/Russian light/dark screenshots using fictional data. Refresh screenshots when their displayed UI changes; do not replace them with private travel photos.
- `docs/ABOUT-SCREENSHOTS.md`, `docs/WELCOME-PHOTOS.md`: screenshot and travel-photo guidance/attribution.
- The downloadable Telegram kit in the working chat is a delivery artifact. The committed `public/brand/telegram-*` files are the maintained copies.

## Redesign pass

1. Save a baseline commit before the deferred visual experiment. A remembered idea is not permission to start a redesign.
2. Update shared tokens and logo sources first. Check light/dark, desktop/mobile, focus states and reduced motion.
3. Review public pages and working screens, then email exports and Telegram assets/copy.
4. Refresh README and About screenshots, favicon/install/social exports and policy navigation where necessary.
5. Upload external Telegram assets separately and inspect the actual bot profile. Check one real email as well as a browser preview.
6. Record what was uploaded and what still needs external verification; do not describe a prepared asset as activated.

The shared footer and the contact section in `components/about.tsx` link to https://t.me/questkeepsbot. Keep both languages in `lib/i18n/` aligned with the bot identity when changing support details.

Trip invitations (1.18.0): `components/archive/invite-dialog.tsx` holds link/in-app invitation controls and visibility copy; `components/trip-invitations.tsx` is the shared header bell and invitation inbox; `components/trip-day-calendar.tsx` marks participation days. Review both languages, mobile layout and dark mode together.
