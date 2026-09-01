const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconTarget(props) {
  return (
    <svg {...base} className={props.className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconCheckCircle(props) {
  return (
    <svg {...base} className={props.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.3 2.3 4.7-5" />
    </svg>
  );
}

export function IconTrendingUp(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M3.5 16.5l6-6 4 4 6.5-7.5" />
      <path d="M15 6.5h5v5" />
    </svg>
  );
}

export function IconWallet(props) {
  return (
    <svg {...base} className={props.className}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M16 14.2h2" />
    </svg>
  );
}

export function IconBuilding(props) {
  return (
    <svg {...base} className={props.className}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  );
}

export function IconUsers(props) {
  return (
    <svg {...base} className={props.className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.5 14.3c2.4.4 4 2.1 4 4.7" />
    </svg>
  );
}

export function IconClipboard(props) {
  return (
    <svg {...base} className={props.className}>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M8.5 12.5l2 2 4.5-4.5" />
    </svg>
  );
}

export function IconPhone(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M5 4.5h3.2l1.3 4-2 1.4c.9 2.2 2.7 4 4.9 4.9l1.4-2 4 1.3V17c0 1.4-1.1 2.5-2.5 2.4C10 19 5 14 4.6 8.5 4.5 6.9 5.5 4.5 5 4.5z" />
    </svg>
  );
}

export function IconChartBars(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconDot(props) {
  return (
    <svg viewBox="0 0 8 8" className={props.className}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

export function IconMenu(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconX(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...base} className={props.className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

export function IconTag(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M11.5 3.5H6a1.5 1.5 0 00-1.5 1.5v5.5c0 .4.16.78.44 1.06l8.5 8.5a1.5 1.5 0 002.12 0l5.5-5.5a1.5 1.5 0 000-2.12l-8.5-8.5a1.5 1.5 0 00-1.06-.44z" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLayers(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5L12 3.5z" />
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
    </svg>
  );
}

export function IconRefresh(props) {
  return (
    <svg {...base} className={props.className}>
      <path d="M20 11a8 8 0 10-2.2 6.6" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}