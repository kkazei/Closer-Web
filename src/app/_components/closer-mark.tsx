type CloserMarkProps = Readonly<{
  className?: string;
}>;

export function CloserMark({ className = "closer-mark" }: CloserMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#18212f" height="37" rx="12" width="37" x="1.5" y="1.5" />
      <path
        d="M7.5 11.5A4.5 4.5 0 0 1 12 7h8.5a4.5 4.5 0 0 1 4.5 4.5v4.75a4.5 4.5 0 0 1-4.5 4.5h-3.8L11 24.5v-3.75h-1a4.5 4.5 0 0 1-4.5-4.5V11.5Z"
        fill="#ed6546"
      />
      <path
        d="M19 23.75a4.5 4.5 0 0 1 4.5-4.5H30a4.5 4.5 0 0 1 4.5 4.5v3.5a4.5 4.5 0 0 1-4.5 4.5h-2v3.5l-4.75-3.5H23.5a4.5 4.5 0 0 1-4.5-4.5v-3.5Z"
        fill="#faf9f6"
      />
      <path
        d="M10.5 12.5h8m-8 3.25h4.5m9.25 8.5h5.5m-5.5 3.25h3"
        stroke="#18212f"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 12.5h8m-8 3.25h4.5"
        stroke="#fffaf5"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
