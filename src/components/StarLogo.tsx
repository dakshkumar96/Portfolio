export function StarLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
    >
      <path
        d="M14 2.2l2.86 7.12 7.64.62-5.86 4.92 1.84 7.44L14 18.7 7.52 22.3l1.84-7.44L3.5 9.94l7.64-.62L14 2.2z"
        fill="#f5f5f5"
      />
    </svg>
  );
}
