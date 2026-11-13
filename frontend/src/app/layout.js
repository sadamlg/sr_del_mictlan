import './globals.css';

export const metadata = {
  title: 'Señor del Mictlán | Desarrollo local',
  description: 'Entorno local de desarrollo de Señor del Mictlán.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
