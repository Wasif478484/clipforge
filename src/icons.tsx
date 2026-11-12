import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

function Base({ size = 18, strokeWidth = 2, children, ...rest }: IconProps & { children: React.ReactNode }) {
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
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Feather/Lucide-style stroke icons (MIT). */
export const FilmIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2" y="2" width="20" height="20" rx="2.18" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </Base>
);

export const MusicIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Base>
);

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </Base>
);

export const PlayIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <path d="M6 4.5v15c0 .9 1 1.5 1.8 1L20 12.9a1.2 1.2 0 0 0 0-1.9L7.8 3.6A1.2 1.2 0 0 0 6 4.5z" />
  </Base>
);

export const PauseIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.1" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.1" />
  </Base>
);

export const SkipBackIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <path d="M19 20L9 12l10-8v16z" />
    <rect x="4.6" y="5" width="2.4" height="14" rx="0.8" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const TypeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7V5h16v2M9 20h6M12 5v15" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1.2 14a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 6" />
  </Base>
);

export const ScissorsIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M8.5 8.5L20 20M8.5 15.5L20 4" />
  </Base>
);

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </Base>
);

export const SparklesIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M19 14l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
  </Base>
);

export const InfoIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Base>
);

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Base>
);

export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" fill="none" style={{ color: 'var(--accent)' }}>
    <rect width="256" height="256" rx="54" fill="currentColor" opacity="0.12" />
    <rect x="46" y="62" width="164" height="132" rx="30" fill="currentColor" opacity="0.2" />
    <rect x="46" y="54" width="164" height="34" rx="17" fill="currentColor" />
    <path d="M68 54l14 34M106 54l14 34M144 54l14 34M182 54l14 34" stroke="var(--canvas)" strokeWidth="10" strokeLinecap="round" />
    <path d="M111 140l38 22-38 22z" fill="var(--canvas)" />
  </svg>
);
export const ImagePlusIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
    <path d="M12 8v6M9 11h6" />
  </Base>
);

export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Base>
);

export const CloudIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98A7 7 0 0 0 4.06 12.2 3.5 3.5 0 0 0 5.5 19z" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Base>
);

export const BookIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
  </Base>
);

export const LayoutGridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Base>
);

export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L8 20H4v-4L17 3z" />
  </Base>
);

export const WandIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 4V2M15 16v-2M8 9H6M20 9h-2M17.78 6.22l-1.42 1.42M17.78 11.78l-1.42-1.42M12.22 6.22l1.42 1.42M12.22 11.78l1.42-1.42" />
    <path d="M3 21L14 10" />
  </Base>
);

