import Image from "next/image";
import { site } from "@/content/site";

// Placeholder art — swap public/avatar.png and public/blush.png for real
// photos whenever you have them. No code changes needed, same filenames.
export function Avatar() {
  return (
    <div className="hero-avatar">
      <div className="avatar-orb">
        <Image
          src="/avatar.png"
          alt={`${site.name} Avatar`}
          width={244}
          height={244}
          priority
        />
        <div className="avatar-blush">
          <Image
            src="/blush.png"
            alt={`${site.name} Blushing`}
            width={244}
            height={244}
            priority
          />
        </div>
      </div>
    </div>
  );
}
