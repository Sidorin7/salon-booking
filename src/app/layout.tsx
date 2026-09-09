import type { Metadata } from "next";
import { Inter, Unbounded } from "next/font/google";
import "./globals.css";

/*
  Оба шрифта грузятся с кириллицей. Это не мелочь настройки:
  без subset "cyrillic" браузер тихо подставит системный шрифт
  на русском тексте, и задуманной типографики на экране не будет.
*/
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  variable: "--font-inter",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Запись в салон",
  description: "Выберите услугу, мастера и удобное время",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} ${unbounded.variable}`}>
      <body>{children}</body>
    </html>
  );
}
