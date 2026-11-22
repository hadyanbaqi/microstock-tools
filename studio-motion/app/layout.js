import "./globals.css";

export const metadata = {
  title: "Studio Motion — HTML ke video, MP4 & ProRes 4444",
  description: "Code editor HTML/CSS/JS, live preview, dan export MP4 H.264 atau MOV ProRes 4444 untuk stock footage.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
