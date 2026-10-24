import { translate } from '@/lib/i18n/translate';
import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import './responsive.css';
import '@fontsource-variable/onest';
import { AppearanceProvider } from '@/components/appearance';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  applicationName: 'QuestKeeps',
  title: translate('app.title', 'ru'),
  description: translate('app.description', 'ru'),
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var r=document.documentElement,m=localStorage.getItem('ta-theme'),l=localStorage.getItem('ta-language');var t=m==='dark'||m==='light'?m:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';r.dataset.theme=t;r.style.colorScheme=t;if(l==='en'||l==='ru')r.lang=l;}catch(e){}",
          }}
        />
      </head>
      <body>
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
