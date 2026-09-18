import { Inter, Instrument_Serif } from "next/font/google";
import { ContentFrame } from "@/components/ContentFrame";
import { Stars } from "@/components/Stars";
import { site } from "@/content/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

export const metadata = {
  title: site.headline,
  description: site.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <Stars />
        <div className="site-shell">
          <ContentFrame>{children}</ContentFrame>
        </div>
      </body>
    </html>
  );
}
