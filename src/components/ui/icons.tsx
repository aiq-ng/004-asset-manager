import { cn } from "@/lib/utils/cn";
import type { NavIcon } from "@/lib/nav";

/**
 * Hand-drawn icon set.
 *
 * The project ships no icon package, and a wire-desk UI leans on a small,
 * consistent set rather than a large library. Every glyph is a 16×16 stroke path
 * so weight and size stay uniform with the surrounding text.
 */

const PATHS: Record<NavIcon, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="8.5" y="2.5" width="5" height="3" rx="1" />
      <rect x="8.5" y="7.5" width="5" height="6" rx="1" />
      <rect x="2.5" y="9.5" width="5" height="4" rx="1" />
    </>
  ),
  box: (
    <>
      <path d="M8 1.9 14 5v6L8 14.1 2 11V5l6-3.1Z" />
      <path d="M2 5l6 3.1L14 5" />
      <path d="M8 8.1v6" />
    </>
  ),
  swap: (
    <>
      <path d="M2.5 5.5h9M9 3l2.5 2.5L9 8" />
      <path d="M13.5 10.5h-9M7 8l-2.5 2.5L7 13" />
    </>
  ),
  layers: (
    <>
      <path d="M8 1.8 14.2 5 8 8.2 1.8 5 8 1.8Z" />
      <path d="M1.8 8 8 11.2 14.2 8" />
      <path d="M1.8 11 8 14.2 14.2 11" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.5a4.2 4.2 0 0 1 8.4 0" />
      <path d="M11 3.4a2.5 2.5 0 0 1 0 4.6" />
      <path d="M12.2 9.6a4.2 4.2 0 0 1 2 3.9" />
    </>
  ),
  building: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path d="M5.6 5.6h1.6M5.6 8.4h1.6M8.8 5.6h1.6M8.8 8.4h1.6M5.6 11.2h1.6M8.8 11.2h1.6" />
    </>
  ),
  audit: (
    <>
      <path d="M3.5 2.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
      <path d="M9.3 2.6V5.7H12.4" />
      <path d="M5.2 9h5.6M5.2 11.6h3.6" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Standalone glyphs used outside the navigation.
 *
 * Each is a component rather than a pre-built element so callers can size and
 * colour it with `className` instead of having every call site repeat the same
 * wrapper.
 */
function glyph(paths: React.ReactNode, displayName: string) {
  const Glyph = ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
  Glyph.displayName = displayName;
  return Glyph;
}

export const Icons = {
  Search: glyph(
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="M10.5 10.5 14 14" />
    </>,
    "SearchIcon",
  ),
  Plus: glyph(<path d="M8 3.5v9M3.5 8h9" />, "PlusIcon"),
  ChevronRight: glyph(<path d="M6.5 3.5 11 8l-4.5 4.5" />, "ChevronRightIcon"),
  ChevronLeft: glyph(<path d="M9.5 3.5 5 8l4.5 4.5" />, "ChevronLeftIcon"),
  Menu: glyph(<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />, "MenuIcon"),
  Close: glyph(<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />, "CloseIcon"),
  Sun: glyph(
    <>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </>,
    "SunIcon",
  ),
  Moon: glyph(<path d="M13.4 9.6A5.9 5.9 0 0 1 6.4 2.6a5.9 5.9 0 1 0 7 7Z" />, "MoonIcon"),
  Printer: glyph(
    <>
      <path d="M4.5 6V2.2h7V6" />
      <path d="M4.5 11.5H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-1.5" />
      <rect x="4.5" y="9.5" width="7" height="4.3" rx="0.5" />
    </>,
    "PrinterIcon",
  ),
  Qr: glyph(
    <>
      <rect x="2" y="2" width="4.6" height="4.6" rx="0.6" />
      <rect x="9.4" y="2" width="4.6" height="4.6" rx="0.6" />
      <rect x="2" y="9.4" width="4.6" height="4.6" rx="0.6" />
      <path d="M9.4 9.4h1.8v1.8H9.4zM12.6 12.6h1.4M12.6 9.4h1.4v1.2" />
    </>,
    "QrIcon",
  ),
  Logout: glyph(
    <>
      <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" />
      <path d="M10.5 11 14 8l-3.5-3M14 8H6" />
    </>,
    "LogoutIcon",
  ),
  User: glyph(
    <>
      <circle cx="8" cy="5.4" r="2.8" />
      <path d="M2.8 14a5.2 5.2 0 0 1 10.4 0" />
    </>,
    "UserIcon",
  ),
  More: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4", className)} fill="currentColor">
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </svg>
  ),
  Inbox: glyph(
    <>
      <path d="M2 9.5h3l1 2h4l1-2h3" />
      <path d="M3.2 3h9.6l1.2 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5L3.2 3Z" />
    </>,
    "InboxIcon",
  ),
  ExternalLink: glyph(
    <>
      <path d="M9.5 2.5H13.5V6.5" />
      <path d="M13.5 2.5 7.5 8.5" />
      <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </>,
    "ExternalLinkIcon",
  ),
  Wrench: glyph(
    <path d="M10.4 2.2a3.6 3.6 0 0 0-4.2 4.6L2.4 10.6a1.4 1.4 0 0 0 2 2l3.8-3.8a3.6 3.6 0 0 0 4.6-4.2l-2 2-2-2 2-2Z" />,
    "WrenchIcon",
  ),
  Package: glyph(
    <>
      <path d="M8 1.8 14 4.6v6.8L8 14.2 2 11.4V4.6L8 1.8Z" />
      <path d="M2 4.6 8 7.4l6-2.8M8 7.4v6.8" />
    </>,
    "PackageIcon",
  ),
  Clipboard: glyph(
    <>
      <path d="M6 2.6H4.5a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V3.6a1 1 0 0 0-1-1H10" />
      <rect x="6" y="1.4" width="4" height="2.4" rx="0.6" />
      <path d="M5.8 7.6h4.4M5.8 10.4h3" />
    </>,
    "ClipboardIcon",
  ),
  Users: glyph(
    <>
      <circle cx="6" cy="5.4" r="2.6" />
      <path d="M1.4 13.6a4.6 4.6 0 0 1 9.2 0" />
      <path d="M10.8 3.2a2.6 2.6 0 0 1 0 4.6M11.6 9.4a4.6 4.6 0 0 1 3 4.2" />
    </>,
    "UsersIcon",
  ),
  Tag: glyph(
    <>
      <path d="M2.4 7.6V3a.6.6 0 0 1 .6-.6h4.6l6 6-5.2 5.2-6-6Z" />
      <circle cx="5.2" cy="5.2" r="0.9" />
    </>,
    "TagIcon",
  ),
  Settings: glyph(
    <>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </>,
    "SettingsIcon",
  ),
  ArrowLeft: glyph(<path d="M13 8H3.5M7 3.5 2.5 8 7 12.5" />, "ArrowLeftIcon"),
  ArrowRight: glyph(<path d="M3 8h9.5M9 3.5 13.5 8 9 12.5" />, "ArrowRightIcon"),
  Check: glyph(<path d="M3 8.4 6.4 11.8 13 4.6" />, "CheckIcon"),
  Alert: glyph(
    <>
      <path d="M8 2.4 14.4 13H1.6L8 2.4Z" />
      <path d="M8 6.6v3M8 11.4v.2" />
    </>,
    "AlertIcon",
  ),
  Info: glyph(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.4v3.4M8 5.2v.2" />
    </>,
    "InfoIcon",
  ),
  Clock: glyph(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.4 1.6" />
    </>,
    "ClockIcon",
  ),
  Calendar: glyph(
    <>
      <rect x="2.4" y="3.2" width="11.2" height="10.4" rx="1" />
      <path d="M2.4 6.4h11.2M5.6 1.8v2.4M10.4 1.8v2.4" />
    </>,
    "CalendarIcon",
  ),
  Mail: glyph(
    <>
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1" />
      <path d="M2 4.4 8 8.8l6-4.4" />
    </>,
    "MailIcon",
  ),
  Phone: glyph(
    <path d="M5.4 2.2H3.2a1 1 0 0 0-1 1.2C2.8 8 8 13.2 12.6 13.8a1 1 0 0 0 1.2-1v-2.2l-2.8-1-1.2 1.6a9.6 9.6 0 0 1-4-4L7.4 5 5.4 2.2Z" />,
    "PhoneIcon",
  ),
  Building: glyph(
    <>
      <path d="M3 14V2.6h6.6V14M9.6 6h3.4v8M1.4 14h13.2" />
      <path d="M5 5h2.6M5 7.6h2.6M5 10.2h2.6" />
    </>,
    "BuildingIcon",
  ),
  Shield: glyph(
    <>
      <path d="M8 1.8 13.2 3.6v4c0 3-2.2 5.4-5.2 6.6-3-1.2-5.2-3.6-5.2-6.6v-4L8 1.8Z" />
      <path d="M5.8 7.9 7.4 9.5l2.8-3" />
    </>,
    "ShieldIcon",
  ),
  Trash: glyph(
    <>
      <path d="M2.6 4.2h10.8M6 4.2V2.8h4v1.4M4 4.2l.7 9a.8.8 0 0 0 .8.8h5a.8.8 0 0 0 .8-.8l.7-9" />
      <path d="M6.6 7v4M9.4 7v4" />
    </>,
    "TrashIcon",
  ),
  Edit: glyph(
    <>
      <path d="M10.4 2.6 13.4 5.6 5.8 13.2H2.8V10.2L10.4 2.6Z" />
      <path d="M9.2 3.8l3 3" />
    </>,
    "EditIcon",
  ),
  Download: glyph(
    <>
      <path d="M8 2.4v7.2M5.2 7l2.8 2.8L10.8 7" />
      <path d="M2.8 11.4v1.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-1.2" />
    </>,
    "DownloadIcon",
  ),
  Grid: glyph(
    <>
      <rect x="2.2" y="2.2" width="4.8" height="4.8" rx="0.6" />
      <rect x="9" y="2.2" width="4.8" height="4.8" rx="0.6" />
      <rect x="2.2" y="9" width="4.8" height="4.8" rx="0.6" />
      <rect x="9" y="9" width="4.8" height="4.8" rx="0.6" />
    </>,
    "GridIcon",
  ),
  Image: glyph(
    <>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1" />
      <circle cx="5.6" cy="6.4" r="1.1" />
      <path d="M2.4 11.6 6 8.4l2.4 2.2 2.2-1.8 3.2 2.8" />
    </>,
    "ImageIcon",
  ),
  Link: glyph(
    <>
      <path d="M6.8 9.2 9.2 6.8" />
      <path d="M7.4 4.6 9 3a2.8 2.8 0 0 1 4 4l-1.6 1.6" />
      <path d="M8.6 11.4 7 13a2.8 2.8 0 0 1-4-4l1.6-1.6" />
    </>,
    "LinkIcon",
  ),
  Refresh: glyph(
    <>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" />
      <path d="M13.4 2.4v3.2h-3.2" />
    </>,
    "RefreshIcon",
  ),
  Filter: glyph(<path d="M2.2 3.4h11.6L9.4 8.4v4.4l-2.8-1.4V8.4L2.2 3.4Z" />, "FilterIcon"),
  Upload: glyph(
    <>
      <path d="M8 10.4V3.2M5.2 6 8 3.2 10.8 6" />
      <path d="M2.8 11.4v1.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-1.2" />
    </>,
    "UploadIcon",
  ),
  Archive: glyph(
    <>
      <rect x="2.2" y="2.8" width="11.6" height="3" rx="0.6" />
      <path d="M3.4 5.8v7.4a.8.8 0 0 0 .8.8h7.6a.8.8 0 0 0 .8-.8V5.8" />
      <path d="M6.4 8.6h3.2" />
    </>,
    "ArchiveIcon",
  ),
} as const;
