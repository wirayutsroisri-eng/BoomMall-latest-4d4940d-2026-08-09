import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BoomMall',
  description: 'BoomMall — shops, products and posts, indexable on the open web.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
