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
