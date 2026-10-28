import Image from "next/image";
import {
  artBoards,
  artPieces,
  caseExhibits,
  childhoodExhibit,
  hackathonExhibit,
  hallExhibits,
  societyExhibit,
  type ExhibitDatum,
} from "@/components/museum/exhibitData";

/*
  What the 3D museum shows, for the ordinary site: the photographs in the
  hall, the objects in its cases and the Art room's posters and
  thumbnails, each with the label it carries in the museum. Read from the
  museum's own data, so the two never disagree; the labels are placards,
  written about him, which is why they sit under their own heading.
*/

/** The hall's photographs, in the order of his life rather than of the walk. */
const PHOTOS: { src: string; width: number; height: number; exhibit: ExhibitDatum }[] = [
  { src: "/museum/childhood.jpg", width: 1500, height: 2000, exhibit: childhoodExhibit },
  { src: "/museum/corridor-flight.jpg", width: 1200, height: 1600, exhibit: hallExhibits[0] },
  { src: "/museum/hackathon.jpg", width: 1200, height: 1600, exhibit: hackathonExhibit },
  { src: "/museum/society.jpg", width: 900, height: 1600, exhibit: societyExhibit },
];

/** A label's subtitle without the museum's "Photograph." prefix, for the picture's description. */
const describe = (exhibit: ExhibitDatum) => (exhibit.meta ?? exhibit.title).replace(/^Photograph\.\s*/, "");

export function MuseumPhotos() {
  return (
    <div className="moment-grid">
      {PHOTOS.map(({ src, width, height, exhibit }) => (
        <figure key={exhibit.id} className="moment">
          <Image src={src} width={width} height={height} alt={`${exhibit.title}, ${describe(exhibit)}`} sizes="(max-width: 760px) 100vw, 380px" />
          <figcaption>
            <h3>{exhibit.title}</h3>
            <p>{exhibit.body}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function MuseumObjects() {
  return (
    <div className="interest-grid">
      {caseExhibits.map((exhibit) => (
        <article key={exhibit.id} className="interest">
          <h3>{exhibit.title}</h3>
          {exhibit.meta ? <p className="interest-meta">{exhibit.meta}</p> : null}
          <p>{exhibit.body}</p>
        </article>
      ))}
    </div>
  );
}

/** The Art room's walls: the posters, then the thumbnails, then its board of numbers. */
export function ArtGallery() {
  const framed = Object.entries(artPieces).filter(([src]) => src.startsWith("/museum/"));
  const posters = framed.filter(([src]) => src.includes("/art-"));
  const thumbs = framed.filter(([src]) => src.includes("/thumb-"));
  const numbers = artBoards.find((board) => board.id === "art-board-numbers");
  const piece = ([src, exhibit]: [string, ExhibitDatum], w: number, h: number, sizes: string) => (
    <figure key={src} className="art-piece">
      <Image src={src} width={w} height={h} alt={`${exhibit.title}, ${exhibit.meta ?? ""}`} sizes={sizes} />
      <figcaption>
        <h3>{exhibit.title}</h3>
        {exhibit.meta ? <p className="interest-meta">{exhibit.meta}</p> : null}
        <p>{exhibit.body}</p>
        {exhibit.bullets?.map((line) => (
          <p key={line} className="art-detail">
            {line}
          </p>
        ))}
      </figcaption>
    </figure>
  );
  return (
    <>
      <section className="art-section">
        <h2 className="art-heading">Posters</h2>
        <div className="art-grid art-grid-posters">
          {posters.map((entry) => piece(entry, 1080, 1350, "(max-width: 760px) 100vw, 360px"))}
        </div>
      </section>
      <section className="art-section">
        <h2 className="art-heading">Thumbnails</h2>
        <div className="art-grid art-grid-thumbs">
          {thumbs.map((entry) => piece(entry, 1280, 720, "(max-width: 760px) 100vw, 540px"))}
        </div>
      </section>
      {numbers ? (
        <section className="art-section">
          <h2 className="art-heading">{numbers.title}</h2>
          <p className="art-numbers">{numbers.body}</p>
        </section>
      ) : null}
    </>
  );
}
