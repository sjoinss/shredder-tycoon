// 직접 그린 SVG 아이콘 세트: 24 그리드, 2px 선, 각진 끝 + 작은 라운드로 통일

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Svg>
);

export const IconSound = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);

export const IconMute = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Svg>
);

export const IconShred = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h10v7" />
    <path d="M3.5 10h17v4h-17z" />
    <path d="M6 14v6M9 14v4M12 14v6M15 14v4M18 14v6" />
  </Svg>
);

export const IconBolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />
  </Svg>
);

export const IconTimer = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 2M9.5 2.5h5" />
  </Svg>
);

export const IconTray = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13.5l2.5-8h13l2.5 8v6H3z" />
    <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconChevronUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);

export const IconCoin = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 9l2 6 2-4.5 2 4.5 2-6M7.5 11.5h9" />
  </Svg>
);

export const IconStack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5h11v13" />
    <path d="M4.5 7.5h11v13h-11z" />
    <path d="M7.5 11.5h5M7.5 14.5h5" />
  </Svg>
);

export const IconMotor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="7" width="12" height="10" rx="1.5" />
    <path d="M16 10.5h3v3h-3M19 12h2.5M7 7V4.5h6V7M7.5 11h5M7.5 13.5h5" />
  </Svg>
);

export const IconFan = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.8" />
    <path d="M12 10.2c-1-3.5.5-6.2 3-6 2 .2 2.3 3-3 6zM13.6 12.9c3.5-1 6.2.5 6 3-.2 2-3 2.3-6-3zM10.4 12.9c-2.5 2.6-5.6 2.7-6.6.4-.8-1.8 1.4-3.6 6.6-.4z" />
  </Svg>
);

export const IconBag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6.5l3 2 3-2-1.5-3h-3z" />
    <path d="M9.5 8C5.5 10 4 14 5 17.5c.6 2 2.5 3 7 3s6.4-1 7-3C20 14 18.5 10 14.5 8" />
  </Svg>
);

export const IconHeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z" />
    <path d="M12 16.5v-6" />
  </Svg>
);

export const IconBin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M6 6.5l1.2 14h9.6l1.2-14M9.5 6.5V4h5v2.5" />
    <path d="M10 10.5v6.5M14 10.5v6.5" />
  </Svg>
);

export const IconReverse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 3.5v4h-4" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M4 17.5l5-5 3.5 3.5 2.5-2.5 5 4.5" />
  </Svg>
);

export const IconHand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.5 0-4-1-5.5-3.5L3.8 13.6a1.4 1.4 0 0 1 2.3-1.6L8 14" />
  </Svg>
);

/** 스테이플러 제거기: 맞물린 두 개의 집게 이빨 */
export const IconStapleRemover = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5l8-5 8 5" />
    <path d="M4 14.5l8 5 8-5" />
    <path d="M9 9.5l3 2.5 3-2.5M9 14.5l3-2.5 3 2.5" />
  </Svg>
);

/** 커터칼: 사선 칼날 + 손잡이 */
export const IconCutter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20.5l5-5" />
    <path d="M7 17l9.5-9.5 3 3L10 20H7z" />
    <path d="M16.5 7.5l3-4 1 1-1 6" />
  </Svg>
);

/** 레터 오프너 + 봉투 */
export const IconLetterOpener = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9h12v10H3z" />
    <path d="M3 9l6 5 6-5" />
    <path d="M14.5 13.5l6.5-9.5M17 10l2 1.5" />
  </Svg>
);

export const IconScissors = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="17.5" r="2.8" />
    <circle cx="6" cy="6.5" r="2.8" />
    <path d="M8.4 8l11.6 9M8.4 16L20 7" />
  </Svg>
);

export const UPGRADE_ICONS = {
  scissors: IconScissors,
  stapleRemover: IconStapleRemover,
  cutter: IconCutter,
  letterOpener: IconLetterOpener,
  autoReverse: IconReverse,
  speed: IconBolt,
  cooldown: IconTimer,
  capacity: IconStack,
  motor: IconMotor,
  fan: IconFan,
  inbox: IconTray,
  bin: IconBag,
} as const;
