const STARS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 17 + 8) % 96}%`,
  delay: `${(i * 0.63) % 9}s`,
  duration: `${9 + (i % 6)}s`,
  size: 5 + (i % 5),
}));

export function Stars() {
  return (
    <div className="starfield" aria-hidden>
      {STARS.map((star, i) => (
        <span
          key={i}
          className="falling-star"
          style={{
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}
