// PWA metadata lives ONLY here — not on the customer feedback page
export const metadata = {
  title:    'RateMyMeal – Owner',
  manifest: '/owner-manifest.json',
  icons: {
    apple: '/icon.png',
  },
  themeColor: '#764ba2',
  appleWebApp: {
    title:          'RateMyMeal',
    statusBarStyle: 'default',
    capable:        true,
  },
};

export default function OwnerLayout({ children }) {
  return children;
}
