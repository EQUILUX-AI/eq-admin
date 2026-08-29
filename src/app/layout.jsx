import './globals.css';

import Providers from './providers';

export const metadata = {
  title: 'Equilux Admin',
  description: 'Equilux admin portal — energy dashboards from eq-ai.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
