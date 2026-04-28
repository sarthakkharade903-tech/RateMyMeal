import './globals.css';

export const metadata = {
  title: 'RateMyMeal – Feedback',
  description: 'Submit your meal feedback',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
