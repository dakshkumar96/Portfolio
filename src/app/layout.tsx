import {
  Inter,
  Instrument_Serif,
  Cormorant_Garamond,
  IM_Fell_English,
  IM_Fell_English_SC,
  IM_Fell_DW_Pica,
  La_Belle_Aurore,
  IBM_Plex_Mono,
} from "next/font/google";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { ContentFrame } from "@/components/ContentFrame";
import { Stars } from "@/components/Stars";
import { site } from "@/content/site";
import "./globals.css";
/* after globals: the museum overlays are set by hand, in brown */
import "./heritage-assets.css";
import "./heritage.css";
/* the loading screen and the sound switch: plain, and deliberately not heritage */
import "./loader.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

/*
  A book face for the catalogue text in the museum.

  Instrument Serif is a display cut with a single weight: right for a
  title, tiring across a paragraph. Cormorant is a Garamond - the face
  museum catalogues and old wall labels were set in - with a true italic
  and real small caps, which is most of what makes text read as
  traditional rather than as interface copy.
*/
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});

/*
  The museum's own voices, each chosen for what it says about the hand
  behind it.

  The Fell faces are digitisations of type cut and cast in the 1670s, and
  they keep what the originals had: uneven ink, slightly soft edges, a
  weight that varies from letter to letter. That irregularity is exactly
  what a clean modern face lacks, and the main reason a page set in one
  reads as printed by a person. Pica is the larger, heavier cut, for
  titles; the SC is true small capitals, for labels.

  La Belle Aurore is an informal pen, for the things a person writes in
  a margin. Every note and signature in the museum uses
  it, so there is exactly one "handwriting" and it is always the same.
*/
const fell = IM_Fell_English({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-fell",
});

const fellSC = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fell-sc",
});

const pica = IM_Fell_DW_Pica({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-pica",
});

const hand = La_Belle_Aurore({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hand",
});

/* every label on the loading screen, and its counter */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-plex-mono",
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
      className={`${inter.variable} ${instrument.variable} ${cormorant.variable} ${fell.variable} ${fellSC.variable} ${pica.variable} ${hand.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <Stars />
        <div className="site-shell">
          <ContentFrame>{children}</ContentFrame>
        </div>
        <BackgroundMusic />
      </body>
    </html>
  );
}
