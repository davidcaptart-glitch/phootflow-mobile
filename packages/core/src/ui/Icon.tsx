// Iconos de trazo propios (24×24, trazo 1,7) para toda la interfaz: nada de emojis en los controles.
import type { JSX } from "preact";

const P: Record<string, JSX.Element> = {
  back: <path d="m15 18-6-6 6-6" />,
  forward: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></g>,
  settings: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  compare: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /><path d="M12 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7z" fill="currentColor" stroke="none" opacity=".35" /></>,
  styles: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3" /></>,
  filters: <><circle cx="9" cy="9" r="6" /><circle cx="15" cy="15" r="6" /></>,
  bokeh: <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /><circle cx="4" cy="5" r="1" /><circle cx="20" cy="6" r="1.4" /><circle cx="19" cy="12" r=".8" /></>,
  beauty: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  crop: <><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></>,
  color: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></>,
  bw: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  edited: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m8 12 3 3 5-6" /></>,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  shapes: <><circle cx="7.5" cy="7.5" r="4" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M17 3l4 7h-8z" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  template: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></>,
  carousel: <><rect x="2" y="5" width="6" height="14" rx="1" /><rect x="9" y="5" width="6" height="14" rx="1" /><rect x="16" y="5" width="6" height="14" rx="1" /></>,
  library: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.8-3.4 3.2-5.5 6-5.5s5.2 2.1 6 5.5" /><path d="M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.8c1.5.7 2.6 2.4 3 5.2" /></>,
  wand: <><path d="m4 20 11-11" /><path d="m13 7 2-2 4 4-2 2z" /><path d="M7 3v2M6 4h2M19 14v2M18 15h2M3 10v1" /></>,
  eraser: <><path d="m7 21-4-4 10.5-10.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11 21z" /><path d="M7 21h14M9 11l6 6" /></>,
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 8v6M8 11h6" /></>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L4 16.5a1.6 1.6 0 0 1 2.4-2L8 16" />,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.1 8.1 20 20M8.1 15.9 20 4" /></>,
  brush: <><path d="M14 4l6 6-8.5 8.5-6-6z" /><path d="M5.5 12.5 3 21l8.5-2.5" /></>,
  tap: <><path d="M9 11V5a2 2 0 0 1 4 0v6l4.4 1a2 2 0 0 1 1.6 2.3L18 21H9.5L6 16.5a1.8 1.8 0 0 1 2.7-2.3L9 14.6" /></>,
  dropper: <><path d="m14 7 3 3M5 19l9.5-9.5M16.5 4.5a2.1 2.1 0 0 1 3 3L17 10l-3-3z" /><path d="M5 19v-2" /></>,
  share: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, class: cls, style }: { name: string; size?: number; class?: string; style?: JSX.CSSProperties }) {
  return (
    <svg class={"ico" + (cls ? " " + cls : "")} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={style}>
      {P[name] ?? null}
    </svg>
  );
}
