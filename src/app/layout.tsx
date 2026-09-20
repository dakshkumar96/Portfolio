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
  openGraph: {
    title: site.headline,
    description: site.description,
    siteName: site.name,
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    // stays "summary" until there is a 1200x630 image to point at;
    // claiming summary_large_image without one just renders nothing
    card: "summary",
    title: site.headline,
    description: site.description,
  },
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
