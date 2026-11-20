import '@fontsource/cinzel-decorative/400.css';
import '@fontsource-variable/open-sans/wght.css';
import '@fontsource-variable/montserrat/wght.css';
import './globals.css';
import { AccountSessionProvider } from '../components/account/account-session.js';
import { CartProvider } from '../components/cart/cart-provider.js';
import CartDrawer from '../components/cart/cart-drawer.js';
import { mediaOrigin } from '../lib/media-url.js';

export const metadata = {
  title: 'Señor del Mictlán | Destilados para compartir',
  description: 'Un espacio para descubrir la colección de Señor del Mictlán.',
};

export default function RootLayout({ children }) {
  const mediaBaseOrigin = mediaOrigin(process.env.MEDIA_BASE_URL || '');

  return (
    <html lang="es" className="h-full antialiased" data-scroll-behavior="smooth">
      <head>
        {mediaBaseOrigin && <link rel="preconnect" href={mediaBaseOrigin} />}
      </head>
      <body className="min-h-full font-sans">
        <AccountSessionProvider>
          <CartProvider mediaBaseUrl={process.env.MEDIA_BASE_URL || ''}>
            <CartDrawer />
            {children}
          </CartProvider>
        </AccountSessionProvider>
      </body>
    </html>
  );
}
