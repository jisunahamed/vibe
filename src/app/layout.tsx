import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strange Attractor Visualizer",
  description: "Interactive 3D attractors with hand tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, padding: 0, background: '#000', color: '#fff' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
