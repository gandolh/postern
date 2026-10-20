// The Postern mark: a wall with a small side gate in it. The same drawing as
// web/public/favicon.svg, coloured from the tokens.

export interface PosternMarkProps {
  /** Pixel size; default 28. */
  size?: number;
  className?: string;
}

export function PosternMark({ size = 28, className }: PosternMarkProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path d="M15 32V20a4 4 0 0 1 8 0v12z" fill="var(--color-canvas)" />
    </svg>
  );
}
