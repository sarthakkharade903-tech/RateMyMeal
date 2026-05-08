import './globals.css';

export const metadata = {
  title:       'RateMyMeal – Feedback',
  description: 'Rate your meal and help us improve',
  icons: {
    icon:     '/icon.png',
    shortcut: '/icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
