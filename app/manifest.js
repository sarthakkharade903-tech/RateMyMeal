// Next.js App Router auto-serves this at /manifest.webmanifest
export default function manifest() {
  return {
    name:             'RateMyMeal',
    short_name:       'RateMyMeal',
    description:      'Rate your meal and help us improve',
    start_url:        '/',
    display:          'standalone',
    background_color: '#f5f5f7',
    theme_color:      '#764ba2',
    icons: [
      {
        src:     '/icon.png',
        sizes:   '192x192',
        type:    'image/png',
        purpose: 'any',
      },
      {
        src:     '/icon.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
