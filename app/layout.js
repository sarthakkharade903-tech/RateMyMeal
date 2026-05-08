import './globals.css';

export const metadata = {
  title: 'RateMyMeal – Feedback',
  description: 'Rate your meal and help us improve',
  icons: {
    icon:     '/icon.png',
    apple:    '/icon.png',
    shortcut: '/icon.png',
  },
  themeColor: '#764ba2',
  appleWebApp: {
    title:           'RateMyMeal',
    statusBarStyle:  'default',
    capable:         true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
