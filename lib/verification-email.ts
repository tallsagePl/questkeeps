import {
  translate,
  type Language,
  type TranslationKey,
} from './i18n/translate';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Mail } from './email-verification';

const website = 'https://questkeeps.ru';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}

function safeLink(value: string) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw Error('Email links require HTTPS');
  if (url.username || url.password)
    throw Error('Email links cannot contain credentials');
  return escapeHtml(url.href);
}

export async function verificationMail(
  to: string,
  url: string,
  test = false,
  language: Language = 'ru',
): Promise<Mail> {
  const target = test ? website : url;
  const href = safeLink(target);
  const support = process.env.EMAIL_SUPPORT_URL
    ? safeLink(process.env.EMAIL_SUPPORT_URL)
    : '';
  const t = (key: TranslationKey) => translate(key, language);
  const title = t(test ? 'email.testTitle' : 'email.verifyTitle');
  const introduction = t(
    test ? 'email.testIntroduction' : 'email.verifyIntroduction',
  );
  const action = t(test ? 'email.testAction' : 'email.verifyAction');
  const note = t(test ? 'email.testNote' : 'email.verifyNote');
  const text = `${title}\n\n${introduction}\n\n${action}: ${target}\n\n${note}\n\n${t(test ? 'email.testFooter' : 'email.ignoreRegistration')}\n\nQuestKeeps — ${t('email.brandLine')}\n${t('email.siteLink')}: ${website}${support ? '\n' + t('email.contactLink') + ': ' + process.env.EMAIL_SUPPORT_URL : ''}`;
  const html = `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title>
<style>@media only screen and (max-width:600px){.email-shell{padding:16px 12px!important}.email-content{padding:32px 24px!important}.email-header{padding:24px!important}.email-title{font-size:30px!important;line-height:36px!important}.email-footer{padding:24px!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f4fa;color:#191c26;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;line-height:1px;color:#f3f4fa;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${t(test ? 'email.testPreheader' : 'email.verifyPreheader')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4fa"><tr><td class="email-shell" align="center" style="padding:48px 20px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce1ef;border-radius:16px;overflow:hidden">
<tr><td class="email-header" style="padding:28px 40px;border-bottom:1px solid #e3e7f1">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="vertical-align:middle;padding-right:12px"><a href="${website}" style="text-decoration:none"><img src="cid:questkeeps-logo" alt="QK" width="40" height="40" style="display:block;width:40px;height:40px;border:0;border-radius:9px"></a></td><td style="vertical-align:middle;font-size:19px;font-weight:700;letter-spacing:-0.4px"><a href="${website}" style="color:#191c26;text-decoration:none">QuestKeeps</a></td></tr></table>
</td></tr>
<tr><td class="email-content" style="padding:40px">
<h1 class="email-title" style="margin:0 0 20px;font-size:36px;line-height:42px;letter-spacing:-0.9px;font-weight:700;color:#191c26">${title}<span style="color:#3448f5">.</span></h1>
<p style="margin:0 0 28px;font-size:16px;line-height:26px;color:#52617d">${introduction}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#3448f5" style="border-radius:10px;background:#3448f5;text-align:center"><a href="${href}" style="display:inline-block;padding:16px 24px;border:1px solid #3448f5;border-radius:10px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:700;mso-padding-alt:0"><!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%">&nbsp;</i><![endif]-->${action}<!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%">&nbsp;</i><![endif]--></a></td></tr></table>
<p style="margin:18px 0 32px;font-size:13px;line-height:21px;color:#52617d">${note}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#52617d">${t('email.linkFallback')}</p>
<p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere"><a href="${href}" style="color:#3448f5;text-decoration:underline;word-break:break-all">${href}</a></p>
</td></tr>
<tr><td class="email-footer" style="padding:28px 40px;border-top:1px solid #e3e7f1;background:#fafbff">
<p style="margin:0 0 12px;font-size:14px;line-height:22px;font-weight:700;color:#191c26">${t('email.brandLine')}</p>
<p style="margin:0 0 16px;font-size:12px;line-height:20px;color:#52617d">${t(test ? 'email.testFooter' : 'email.ignoreRegistration')}</p>
<p style="margin:0;font-size:12px;line-height:20px"><a href="${website}" style="color:#3448f5;text-decoration:underline">${t('email.siteLink')}</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${website}/about" style="color:#3448f5;text-decoration:underline">${t('email.aboutLink')}</a>${support ? '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + support + '" style="color:#3448f5;text-decoration:underline">' + t('email.contactLink') + '</a>' : ''}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    to,
    subject: t(test ? 'email.testSubject' : 'email.verifySubject'),
    text,
    html,
    attachments: [
      {
        filename: 'questkeeps.png',
        content: (
          await readFile(resolve('public/brand/questkeeps-avatar.png'))
        ).toString('base64'),
        content_id: 'questkeeps-logo',
      },
    ],
  };
}
