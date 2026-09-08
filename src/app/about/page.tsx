import { Avatar } from "@/components/Avatar";
import { CurveTitle } from "@/components/CurveTitle";
import { about, facts } from "@/content/site";

export const metadata = {
  title: "About | Daksh Kumar",
};

export default function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <CurveTitle text={about.curve} fontSize={40} />
        <Avatar />
        <p className="page-kicker">{about.kicker}</p>
        <p className="bio">{about.intro}</p>
        <p className="looking-for">{about.lookingFor}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>Who I Am</h2>
        </div>
        <div className="about-copy">
          {about.whoIAm.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Facts About Me</h2>
        </div>
        <ul className="facts-list">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
