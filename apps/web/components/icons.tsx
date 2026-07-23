import type { SVGProps } from "react";

/* Inline stroke icons transcribed from the Claude Design landing page.
   Color comes from `currentColor` so the parent sets it via CSS. */

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function StrokeIcon({ size = 24, strokeWidth = 1.7, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function WaveformIcon({ withDot = false, ...props }: IconProps & { withDot?: boolean }) {
  return (
    <StrokeIcon {...props}>
      <path d="M3 12h3l2-3 3 6 2-4h8" />
      {withDot && <circle cx="20" cy="12" r="1.4" fill="currentColor" stroke="none" />}
    </StrokeIcon>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 3c1 3.5-1.5 4.5-1.5 7A1.5 1.5 0 0012 11.5 1.5 1.5 0 0013.5 10c1.5 1 2.5 2.8 2.5 4.5a4 4 0 11-8 0c0-3 2-5 4-11.5z" />
    </StrokeIcon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </StrokeIcon>
  );
}

export function TrendIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </StrokeIcon>
  );
}

export function NotesIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </StrokeIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </StrokeIcon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </StrokeIcon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
    </StrokeIcon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0012 0" />
      <path d="M12 17v3" />
    </StrokeIcon>
  );
}

export function MedalIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L7.5 21l4.5-2.6L16.5 21 15 13.5" />
    </StrokeIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </StrokeIcon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 16V5" />
      <path d="M8 9l4-4 4 4" />
      <path d="M5 19h14" />
    </StrokeIcon>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 4a3.5 3.5 0 010 7M18 20c0-2.4-1-4.3-2.6-5.3" />
    </StrokeIcon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
    </StrokeIcon>
  );
}

export function PlayIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/* Filled brand marks (official simple-icons glyphs). Unlike the UI icons above
   these fill with `currentColor` so the recognizable logo shape reads at small
   footer sizes. */
function BrandIcon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 01-1.38-.9 3.72 3.72 0 01-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.98c-3.14 0-3.52.01-4.76.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.24-.07 1.62-.07 4.76s.01 3.52.07 4.76c.04.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.24.06 1.62.07 4.76.07s3.52-.01 4.76-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.24.07-1.62.07-4.76s-.01-3.52-.07-4.76c-.04-.9-.19-1.39-.32-1.71a2.86 2.86 0 00-.69-1.06 2.86 2.86 0 00-1.06-.69c-.32-.13-.81-.28-1.71-.32-1.24-.06-1.62-.07-4.76-.07zm0 3.36a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 1.98a2.52 2.52 0 100 5.04 2.52 2.52 0 000-5.04zm4.72-3.5a1.05 1.05 0 110 2.1 1.05 1.05 0 010-2.1z" />
    </BrandIcon>
  );
}

export function LinkedInIcon(props: IconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </BrandIcon>
  );
}
