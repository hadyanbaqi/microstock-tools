import "./globals.css";

export const metadata = {
  title: "StockScope — Riset Microstock",
  description: "Riset niche, keyword, dan kompetitor Adobe Stock untuk kontributor microstock.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Inter for text; 800 uppercase for display headings (see DESIGN.md). */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
