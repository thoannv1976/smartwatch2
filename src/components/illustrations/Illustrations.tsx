/**
 * Hand-drawn SVG illustrations for the Smartwatch CEO Challenge.
 *
 * The same file lives in both apps (smartwatch6 and smartwatch2), so keep it
 * free of app imports. Flat style on a fixed palette, no external images and
 * no hooks, so it also renders in server components. Every picture is
 * decorative (aria-hidden): the text next to it carries the meaning, and the
 * only text drawn inside is numbers and symbols, which need no translation.
 */
import type { ReactNode } from 'react';

const C = {
  ink: '#1e1b4b',
  bezel: '#312e81',
  screen: '#1e1b4b',
  indigo: '#4f46e5',
  indigoL: '#a5b4fc',
  indigoXL: '#e0e7ff',
  violet: '#7c3aed',
  violetL: '#c4b5fd',
  violetXL: '#ede9fe',
  sky: '#0ea5e9',
  skyL: '#7dd3fc',
  skyXL: '#e0f2fe',
  emerald: '#10b981',
  emeraldL: '#6ee7b7',
  emeraldXL: '#d1fae5',
  amber: '#f59e0b',
  amberL: '#fcd34d',
  amberXL: '#fef3c7',
  rose: '#f43f5e',
  roseL: '#fda4af',
  roseXL: '#ffe4e6',
  pink: '#ec4899',
  pinkXL: '#fce7f3',
  slate: '#64748b',
  slateL: '#cbd5e1',
  slateXL: '#f1f5f9',
  white: '#ffffff',
} as const;

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function Svg({
  viewBox,
  className,
  children,
}: {
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      {children}
    </svg>
  );
}

/**
 * A smartwatch. (x, y) is the top-left of the case; `screen` draws inside the
 * display and gets its own size, with (0, 0) at the display's top-left.
 */
function Watch({
  x,
  y,
  w,
  strap = C.indigo,
  face = C.screen,
  screen,
}: {
  x: number;
  y: number;
  w: number;
  strap?: string;
  face?: string;
  screen?: (width: number, height: number) => ReactNode;
}) {
  const h = w * 1.15;
  const strapW = w * 0.62;
  const strapX = x + (w - strapW) / 2;
  const inset = w * 0.08;
  const sw = w - inset * 2;
  const sh = h - inset * 2;
  return (
    <g>
      <rect
        x={strapX}
        y={y - w * 0.48}
        width={strapW}
        height={w * 0.62}
        rx={strapW * 0.22}
        fill={strap}
      />
      <rect
        x={strapX}
        y={y + h - w * 0.14}
        width={strapW}
        height={w * 0.62}
        rx={strapW * 0.22}
        fill={strap}
      />
      <rect
        x={x + w - w * 0.02}
        y={y + h * 0.3}
        width={w * 0.08}
        height={h * 0.2}
        rx={w * 0.04}
        fill={C.bezel}
      />
      <rect x={x} y={y} width={w} height={h} rx={w * 0.27} fill={C.bezel} />
      <rect x={x + inset} y={y + inset} width={sw} height={sh} rx={w * 0.2} fill={face} />
      {screen ? <g transform={`translate(${x + inset} ${y + inset})`}>{screen(sw, sh)}</g> : null}
    </g>
  );
}

/** Four-point sparkle centred on (x, y). */
function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const k = r * 0.28;
  return (
    <path
      d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r}Z`}
      fill={fill}
    />
  );
}

/** Heart centred on (x, y), roughly 2r wide. */
function Heart({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y + r * 0.9} C${x - r * 1.6} ${y - r * 0.1} ${x - r * 0.9} ${y - r * 1.4} ${x} ${y - r * 0.45} C${x + r * 0.9} ${y - r * 1.4} ${x + r * 1.6} ${y - r * 0.1} ${x} ${y + r * 0.9}Z`}
      fill={fill}
    />
  );
}

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(
      `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`,
    );
  }
  return <polygon points={pts.join(' ')} fill={fill} />;
}

function Label({
  x,
  y,
  size,
  fill,
  children,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={800}
      fill={fill}
      textAnchor={anchor}
      fontFamily={FONT}
    >
      {children}
    </text>
  );
}

/** A white floating card with a soft shadow. */
function Chip({
  x,
  y,
  w,
  h,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children: ReactNode;
}) {
  return (
    <g>
      <rect x={x + 2} y={y + 5} width={w} height={h} rx={h * 0.3} fill={C.indigo} opacity={0.12} />
      <rect x={x} y={y} width={w} height={h} rx={h * 0.3} fill={C.white} />
      {children}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

/** Big smartwatch with floating results: for the landing and login pages. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 360 300" className={className}>
      <circle cx={180} cy={152} r={128} fill={C.indigoXL} />
      <circle cx={180} cy={152} r={96} fill={C.white} opacity={0.6} />
      <circle cx={52} cy={58} r={6} fill={C.violetL} />
      <circle cx={320} cy={250} r={8} fill={C.skyL} />
      <circle cx={300} cy={36} r={4} fill={C.amberL} />
      <Sparkle x={72} y={238} r={10} fill={C.amberL} />
      <Sparkle x={292} y={132} r={7} fill={C.violetL} />

      <Watch
        x={122}
        y={86}
        w={116}
        strap={C.indigo}
        screen={(w, h) => (
          <g>
            <circle cx={w / 2} cy={h * 0.34} r={w * 0.25} stroke={C.bezel} strokeWidth={8} />
            <path
              d={`M${w / 2} ${h * 0.34 - w * 0.25} A${w * 0.25} ${w * 0.25} 0 1 1 ${w / 2 - w * 0.24} ${h * 0.34 + w * 0.07}`}
              stroke={C.emeraldL}
              strokeWidth={8}
              strokeLinecap="round"
            />
            <Label x={w / 2} y={h * 0.34 + 6} size={17} fill={C.white}>
              86
            </Label>
            {[0.3, 0.48, 0.42, 0.66, 0.82].map((v, i) => (
              <rect
                key={i}
                x={w * 0.14 + i * w * 0.15}
                y={h * 0.9 - v * h * 0.3}
                width={w * 0.1}
                height={v * h * 0.3}
                rx={2}
                fill={i === 4 ? C.amberL : C.indigoL}
              />
            ))}
          </g>
        )}
      />

      <Chip x={18} y={104} w={96} h={42}>
        <circle cx={40} cy={125} r={12} fill={C.emeraldXL} />
        <path
          d="M34 129 L40 121 L46 129"
          stroke={C.emerald}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Label x={58} y={131} size={16} fill={C.ink} anchor="start">
          +24%
        </Label>
      </Chip>

      <Chip x={250} y={70} w={86} h={42}>
        <circle cx={272} cy={91} r={12} fill={C.amberXL} />
        <path d="M266 84 H278 V89 A6 6 0 0 1 266 89 Z" fill={C.amber} />
        <rect x={270} y={95} width={4} height={4} fill={C.amber} />
        <rect x={266} y={99} width={12} height={3} rx={1} fill={C.amber} />
        <Label x={292} y={97} size={16} fill={C.ink} anchor="start">
          #1
        </Label>
      </Chip>

      <Chip x={246} y={190} w={96} h={42}>
        <circle cx={268} cy={211} r={11} stroke={C.skyXL} strokeWidth={6} />
        <path d="M268 200 A11 11 0 0 1 278.5 214" stroke={C.sky} strokeWidth={6} />
        <Label x={286} y={217} size={16} fill={C.ink} anchor="start">
          32%
        </Label>
      </Chip>
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Strategic positioning                                                       */
/* -------------------------------------------------------------------------- */

type Tone = { bg: string; strap: string; badge: string };
const BALANCED_TONE: Tone = { bg: C.indigoXL, strap: C.indigo, badge: C.indigo };
const POSITION_TONE: Record<string, Tone | undefined> = {
  affordable: { bg: C.emeraldXL, strap: C.emerald, badge: C.emerald },
  fitness: { bg: C.roseXL, strap: C.rose, badge: C.rose },
  premium: { bg: C.amberXL, strap: C.amber, badge: C.amber },
  technology: { bg: C.skyXL, strap: C.sky, badge: C.sky },
  lifestyle: { bg: C.pinkXL, strap: C.pink, badge: C.violet },
  balanced: BALANCED_TONE,
};

function PositionBadge({ kind }: { kind: string }) {
  // Badge circle at (46, 20), r = 13.
  switch (kind) {
    case 'affordable':
      return (
        <Label x={46} y={26} size={17} fill={C.white}>
          $
        </Label>
      );
    case 'fitness':
      return (
        <path
          d="M36 21 H41 L43 15 L47 26 L50 20 H56"
          stroke={C.white}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'premium':
      return <path d="M39 17 H53 L56 21 L46 31 L36 21 Z" fill={C.white} />;
    case 'technology':
      return (
        <g stroke={C.white} strokeWidth={2} strokeLinecap="round">
          <rect x={41} y={15} width={10} height={10} rx={2} />
          <path d="M44 12 V15 M48 12 V15 M44 25 V28 M48 25 V28 M38 18 H41 M38 22 H41 M51 18 H54 M51 22 H54" />
        </g>
      );
    case 'lifestyle':
      return <Heart x={46} y={21} r={7} fill={C.white} />;
    default:
      return (
        <g stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 12 V28 M41 28 H51 M37 16 H55" />
          <path d="M37 16 L34 22 H40 Z M55 16 L52 22 H58 Z" fill={C.white} />
        </g>
      );
  }
}

/** Small picture for one strategic positioning (affordable, fitness, premium, technology, lifestyle, balanced). */
export function PositioningArt({
  positioning,
  className,
}: {
  positioning: string;
  className?: string;
}) {
  const kind = positioning.toLowerCase();
  const tone = POSITION_TONE[kind] ?? BALANCED_TONE;
  return (
    <Svg viewBox="0 0 64 64" className={className}>
      <rect width={64} height={64} rx={16} fill={tone.bg} />
      <Watch
        x={13}
        y={24}
        w={24}
        strap={tone.strap}
        screen={(w, h) =>
          kind === 'fitness' ? (
            <path
              d={`M2 ${h / 2} H${w * 0.35} L${w * 0.5} ${h * 0.25} L${w * 0.62} ${h * 0.72} L${w * 0.72} ${h / 2} H${w - 2}`}
              stroke={C.roseL}
              strokeWidth={1.6}
              fill="none"
            />
          ) : (
            <circle cx={w / 2} cy={h / 2} r={w * 0.28} stroke={tone.strap} strokeWidth={2} />
          )
        }
      />
      <circle cx={46} cy={20} r={13} fill={tone.badge} />
      <circle cx={46} cy={20} r={13} stroke={C.white} strokeWidth={2.5} />
      <PositionBadge kind={kind} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Market events                                                               */
/* -------------------------------------------------------------------------- */

/** Rounded backdrop + ground shared by every event scene (viewBox 320 x 180). */
function Stage({ bg, ground, children }: { bg: string; ground: string; children: ReactNode }) {
  return (
    <g>
      <rect width={320} height={180} rx={22} fill={bg} />
      <ellipse cx={160} cy={160} rx={130} ry={10} fill={ground} opacity={0.35} />
      {children}
    </g>
  );
}

function SceneNormal() {
  return (
    <Stage bg={C.indigoXL} ground={C.indigoL}>
      <circle cx={274} cy={40} r={16} fill={C.amberL} />
      <path
        d="M24 66 L40 54 L56 58 L74 38"
        stroke={C.indigoL}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x={90} y={76} width={140} height={82} rx={6} fill={C.white} />
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = i % 2 === 0 ? C.indigo : C.indigoL;
        const tx = 94 + i * 26.4;
        const bx = 84 + i * 30.4;
        return (
          <g key={i}>
            <path d={`M${tx} 54 H${tx + 26.4} L${bx + 30.4} 76 H${bx} Z`} fill={fill} />
            <path d={`M${bx} 76 A15.2 9 0 0 0 ${bx + 30.4} 76 Z`} fill={fill} />
          </g>
        );
      })}
      <rect x={104} y={96} width={112} height={44} rx={4} fill={C.indigoXL} />
      <Watch x={116} y={106} w={18} strap={C.violet} />
      <Watch x={151} y={106} w={18} strap={C.sky} />
      <Watch x={186} y={106} w={18} strap={C.emerald} />
      <rect x={90} y={144} width={140} height={14} rx={3} fill={C.indigoL} opacity={0.6} />
    </Stage>
  );
}

function SceneFitness() {
  return (
    <Stage bg={C.emeraldXL} ground={C.emeraldL}>
      <circle cx={270} cy={36} r={14} fill={C.amberL} />
      <Heart x={222} y={92} r={38} fill={C.rose} />
      <path
        d="M150 92 H196 L206 70 L218 114 L228 84 L236 92 H296"
        stroke={C.white}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M150 92 H190" stroke={C.rose} strokeWidth={5} strokeLinecap="round" />
      {/* runner */}
      <g stroke={C.ink} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M92 70 L82 108" />
        <path d="M82 108 L104 128 L100 152" />
        <path d="M82 108 L66 128 L46 132" />
        <path d="M90 78 L110 92 L124 82" />
        <path d="M90 78 L70 88 L60 76" />
      </g>
      <rect x={118} y={76} width={10} height={9} rx={2} fill={C.emerald} />
      <circle cx={97} cy={54} r={11} fill={C.ink} />
      <path
        d="M30 120 H50 M20 104 H44"
        stroke={C.emerald}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.6}
      />
    </Stage>
  );
}

function SceneSale() {
  return (
    <Stage bg={C.roseXL} ground={C.roseL}>
      <g transform="rotate(-14 90 92)">
        <path d="M50 66 H120 L136 92 L120 118 H50 Z" fill={C.rose} />
        <circle cx={60} cy={92} r={6} fill={C.roseXL} />
        <Label x={98} y={101} size={24} fill={C.white}>
          -30%
        </Label>
      </g>
      <g transform="rotate(10 236 104)">
        <path d="M196 80 H262 L276 104 L262 128 H196 Z" fill={C.amber} />
        <circle cx={206} cy={104} r={5} fill={C.amberXL} />
        <Label x={240} y={112} size={22} fill={C.white}>
          %
        </Label>
      </g>
      <Watch
        x={146}
        y={84}
        w={34}
        strap={C.indigo}
        screen={(w, h) => (
          <Label x={w / 2} y={h / 2 + 5} size={13} fill={C.roseL}>
            $
          </Label>
        )}
      />
      <path
        d="M164 22 V54 M152 42 L164 56 L176 42"
        stroke={C.rose}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Stage>
  );
}

function SceneSlowdown() {
  return (
    <Stage bg={C.slateXL} ground={C.slateL}>
      <g fill={C.slateL}>
        <circle cx={96} cy={44} r={20} />
        <circle cx={122} cy={36} r={24} />
        <circle cx={148} cy={46} r={18} />
        <rect x={76} y={44} width={90} height={20} rx={10} />
      </g>
      {[86, 108, 130, 152].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${76 + (i % 2) * 8} l-5 12`}
          stroke={C.sky}
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      <path
        d="M186 50 L216 78 L240 68 L280 116"
        stroke={C.rose}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M266 118 H282 V102"
        stroke={C.rose}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* umbrella over coins */}
      <path d="M70 118 A42 32 0 0 1 154 118 Z" fill={C.indigo} />
      <path
        d="M112 118 V148 a6 6 0 0 1 -12 0"
        stroke={C.ink}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      {[0, 1, 2].map((i) => (
        <ellipse
          key={i}
          cx={136}
          cy={152 - i * 8}
          rx={14}
          ry={5}
          fill={C.amber}
          stroke={C.amberXL}
          strokeWidth={1.5}
        />
      ))}
    </Stage>
  );
}

function SceneAi() {
  return (
    <Stage bg={C.violetXL} ground={C.violetL}>
      <g stroke={C.violetL} strokeWidth={4} strokeLinecap="round" fill="none">
        <path d="M56 50 H96 V80" />
        <path d="M40 120 H90 V100" />
        <path d="M264 46 H226 V74" />
        <path d="M280 130 H230 V110" />
      </g>
      {[
        [56, 50],
        [40, 120],
        [264, 46],
        [280, 130],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={6} fill={C.violet} />
      ))}
      <Watch
        x={128}
        y={56}
        w={64}
        strap={C.violet}
        screen={(w, h) => (
          <g>
            <rect
              x={w * 0.22}
              y={h * 0.24}
              width={w * 0.56}
              height={h * 0.52}
              rx={6}
              fill={C.violet}
            />
            <Label x={w / 2} y={h / 2 + 6} size={15} fill={C.white}>
              AI
            </Label>
          </g>
        )}
      />
      <Sparkle x={222} y={34} r={14} fill={C.amberL} />
      <Sparkle x={100} y={150} r={9} fill={C.amberL} />
      <Sparkle x={244} y={156} r={7} fill={C.violet} />
    </Stage>
  );
}

function SceneShopping() {
  return (
    <Stage bg={C.amberXL} ground={C.amberL}>
      <rect x={60} y={30} width={74} height={128} rx={14} fill={C.ink} />
      <rect x={66} y={42} width={62} height={104} rx={8} fill={C.white} />
      <path
        d="M78 74 H84 L92 104 H116 L122 82 H88"
        stroke={C.indigo}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={95} cy={114} r={4} fill={C.indigo} />
      <circle cx={113} cy={114} r={4} fill={C.indigo} />
      <rect x={76} y={128} width={42} height={10} rx={5} fill={C.amber} />
      <path d="M170 92 H232 L226 156 H176 Z" fill={C.rose} />
      <path d="M186 92 V82 a15 15 0 0 1 30 0 V92" stroke={C.ink} strokeWidth={4} fill="none" />
      <rect x={238} y={118} width={46} height={40} rx={4} fill={C.amber} />
      <rect x={244} y={84} width={34} height={34} rx={4} fill={C.amberL} />
      <path d="M261 118 V158 M261 84 V118" stroke={C.amberXL} strokeWidth={4} />
      <circle cx={236} cy={44} r={18} fill={C.indigo} />
      <Label x={236} y={51} size={17} fill={C.white}>
        %
      </Label>
      <Sparkle x={160} y={50} r={9} fill={C.rose} />
    </Stage>
  );
}

function SceneQuality() {
  return (
    <Stage bg={C.skyXL} ground={C.skyL}>
      <Watch
        x={88}
        y={62}
        w={58}
        strap={C.sky}
        screen={(w, h) => (
          <circle cx={w / 2} cy={h / 2} r={w * 0.26} stroke={C.skyL} strokeWidth={3} />
        )}
      />
      <circle
        cx={174}
        cy={92}
        r={34}
        fill={C.white}
        opacity={0.55}
        stroke={C.ink}
        strokeWidth={8}
      />
      <path d="M198 118 L230 150" stroke={C.ink} strokeWidth={12} strokeLinecap="round" />
      <path
        d="M160 92 L170 102 L190 80"
        stroke={C.emerald}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Star x={232} y={44} r={14} fill={C.amber} />
      <Star x={262} y={64} r={11} fill={C.amber} />
      <Star x={282} y={92} r={9} fill={C.amberL} />
      <Sparkle x={52} y={44} r={9} fill={C.sky} />
    </Stage>
  );
}

function SceneService() {
  return (
    <Stage bg={C.pinkXL} ground={C.roseL}>
      <path
        d="M50 40 H170 a14 14 0 0 1 14 14 V96 a14 14 0 0 1 -14 14 H92 L70 130 V110 H50 a14 14 0 0 1 -14 -14 V54 a14 14 0 0 1 14 -14Z"
        fill={C.white}
      />
      <Heart x={110} y={76} r={18} fill={C.rose} />
      <path
        d="M150 82 H262 a12 12 0 0 1 12 12 V132 a12 12 0 0 1 -12 12 H254 V162 L234 144 H150 a12 12 0 0 1 -12 -12 V94 a12 12 0 0 1 12 -12Z"
        fill={C.indigo}
      />
      <circle cx={186} cy={106} r={4} fill={C.white} />
      <circle cx={226} cy={106} r={4} fill={C.white} />
      <path
        d="M186 120 Q206 136 226 120"
        stroke={C.white}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      <Star x={280} y={46} r={12} fill={C.amber} />
      <Star x={252} y={30} r={8} fill={C.amberL} />
    </Stage>
  );
}

/** Megaphone pointing right; mouth at about (150, 96). */
function Megaphone({ body, grip }: { body: string; grip: string }) {
  return (
    <g>
      <path d="M86 112 L94 140 H108 L102 116" fill={grip} />
      <rect x={48} y={88} width={26} height={24} rx={6} fill={grip} />
      <path d="M70 92 L150 54 V138 L70 108 Z" fill={body} />
      <rect x={146} y={50} width={10} height={92} rx={5} fill={body} />
    </g>
  );
}

function SceneHype() {
  return (
    <Stage bg={C.violetXL} ground={C.violetL}>
      <Megaphone body={C.violet} grip={C.ink} />
      <g stroke={C.violet} strokeWidth={5} strokeLinecap="round" fill="none">
        <path d="M170 74 Q180 96 170 118" />
        <path d="M186 62 Q202 96 186 130" opacity={0.6} />
      </g>
      <Heart x={236} y={56} r={16} fill={C.rose} />
      <Heart x={268} y={100} r={11} fill={C.pink} />
      <Star x={226} y={124} r={14} fill={C.amber} />
      <Star x={282} y={42} r={8} fill={C.amberL} />
      <Sparkle x={250} y={150} r={8} fill={C.violet} />
    </Stage>
  );
}

function SceneShortage() {
  return (
    <Stage bg={C.amberXL} ground={C.amberL}>
      <path d="M40 156 V92 L76 72 V92 L112 72 V92 L148 72 V156 Z" fill={C.slate} />
      <rect x={118} y={40} width={18} height={44} fill={C.slate} />
      <circle cx={130} cy={30} r={8} fill={C.slateL} />
      <circle cx={144} cy={20} r={6} fill={C.slateL} opacity={0.7} />
      <rect x={54} y={112} width={16} height={16} rx={2} fill={C.amberL} />
      <rect x={86} y={112} width={16} height={16} rx={2} fill={C.amberL} />
      <rect x={160} y={140} width={126} height={10} rx={5} fill={C.ink} />
      <circle cx={174} cy={155} r={5} fill={C.slate} />
      <circle cx={272} cy={155} r={5} fill={C.slate} />
      <rect x={172} y={110} width={30} height={30} rx={3} fill={C.amber} />
      <rect
        x={212}
        y={110}
        width={30}
        height={30}
        rx={3}
        fill="none"
        stroke={C.slate}
        strokeWidth={3}
        strokeDasharray="6 5"
      />
      <rect
        x={252}
        y={110}
        width={30}
        height={30}
        rx={3}
        fill="none"
        stroke={C.slate}
        strokeWidth={3}
        strokeDasharray="6 5"
      />
      <path
        d="M232 30 L262 82 H202 Z"
        fill={C.rose}
        strokeLinejoin="round"
        stroke={C.rose}
        strokeWidth={6}
      />
      <Label x={232} y={76} size={26} fill={C.white}>
        !
      </Label>
    </Stage>
  );
}

function SceneExpansion() {
  return (
    <Stage bg={C.skyXL} ground={C.skyL}>
      <circle cx={160} cy={92} r={52} fill={C.sky} />
      <path
        d="M128 64 Q142 58 150 70 Q158 84 144 90 Q132 96 126 84Z M166 52 Q186 50 196 64 Q190 74 176 70 Q166 66 166 52Z M170 104 Q190 98 200 112 Q192 132 176 134 Q166 120 170 104Z"
        fill={C.emeraldL}
      />
      <ellipse cx={160} cy={92} rx={52} ry={20} stroke={C.white} strokeWidth={2} opacity={0.5} />
      <ellipse cx={160} cy={92} rx={22} ry={52} stroke={C.white} strokeWidth={2} opacity={0.5} />
      <g stroke={C.indigo} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M96 60 L60 36 M60 36 H74 M60 36 V50" />
        <path d="M224 60 L260 36 M260 36 H246 M260 36 V50" />
        <path d="M96 126 L60 150 M60 150 H74 M60 150 V136" />
        <path d="M224 126 L260 150 M260 150 H246 M260 150 V136" />
      </g>
      <path
        d="M160 40 a12 12 0 0 1 12 12 c0 10 -12 22 -12 22 s-12 -12 -12 -22 a12 12 0 0 1 12 -12Z"
        fill={C.rose}
      />
      <circle cx={160} cy={52} r={4.5} fill={C.white} />
    </Stage>
  );
}

function SceneFatigue() {
  return (
    <Stage bg={C.slateXL} ground={C.slateL}>
      <rect
        x={176}
        y={36}
        width={106}
        height={66}
        rx={8}
        fill={C.white}
        stroke={C.slateL}
        strokeWidth={3}
      />
      <path
        d="M188 52 H246 M188 66 H268 M188 80 H232"
        stroke={C.slateL}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path d="M222 102 V150 M236 102 V150" stroke={C.slate} strokeWidth={5} />
      <path
        d="M190 46 L268 92"
        stroke={C.rose}
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.8}
      />
      <g transform="translate(-14 4) rotate(20 100 96)">
        <Megaphone body={C.slate} grip={C.ink} />
      </g>
      <Label x={146} y={58} size={22} fill={C.indigo}>
        Z
      </Label>
      <Label x={128} y={38} size={16} fill={C.indigoL}>
        z
      </Label>
      <Label x={162} y={84} size={13} fill={C.indigoL}>
        z
      </Label>
    </Stage>
  );
}

const EVENT_SCENES: Record<string, () => ReactNode> = {
  normal_market: SceneNormal,
  fitness_health_boom: SceneFitness,
  price_competition: SceneSale,
  economic_slowdown: SceneSlowdown,
  ai_smartwatch_features: SceneAi,
  online_shopping_peak: SceneShopping,
  quality_expectations: SceneQuality,
  service_expectations: SceneService,
  brand_hype: SceneHype,
  supply_shortage: SceneShortage,
  market_expansion: SceneExpansion,
  marketing_fatigue: SceneFatigue,
};

/** Scene for one market event. Accepts either key style (`fitness_health_boom` or `FITNESS_HEALTH_BOOM`). */
export function EventArt({ eventKey, className }: { eventKey: string; className?: string }) {
  const Scene = EVENT_SCENES[eventKey.toLowerCase()] ?? SceneNormal;
  return (
    <Svg viewBox="0 0 320 180" className={className}>
      <Scene />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

function Trophy({ x, y, s }: { x: number; y: number; s: number }) {
  // (x, y) = top centre of the cup; s = cup width.
  const h = s * 0.8;
  return (
    <g>
      <path
        d={`M${x - s * 0.5} ${y + s * 0.12} h-${s * 0.16} a${s * 0.18} ${s * 0.2} 0 0 0 ${s * 0.22} ${s * 0.34}`}
        stroke={C.amber}
        strokeWidth={s * 0.08}
        fill="none"
      />
      <path
        d={`M${x + s * 0.5} ${y + s * 0.12} h${s * 0.16} a${s * 0.18} ${s * 0.2} 0 0 1 -${s * 0.22} ${s * 0.34}`}
        stroke={C.amber}
        strokeWidth={s * 0.08}
        fill="none"
      />
      <path
        d={`M${x - s * 0.5} ${y} H${x + s * 0.5} V${y + h * 0.35} A${s * 0.5} ${h * 0.65} 0 0 1 ${x - s * 0.5} ${y + h * 0.35} Z`}
        fill={C.amber}
      />
      <path
        d={`M${x - s * 0.3} ${y + s * 0.08} V${y + h * 0.4}`}
        stroke={C.amberXL}
        strokeWidth={s * 0.08}
        strokeLinecap="round"
        opacity={0.8}
      />
      <rect x={x - s * 0.08} y={y + h} width={s * 0.16} height={s * 0.22} fill={C.amber} />
      <rect
        x={x - s * 0.3}
        y={y + h + s * 0.2}
        width={s * 0.6}
        height={s * 0.14}
        rx={s * 0.04}
        fill={C.ink}
      />
    </g>
  );
}

/**
 * Podium for the top three, or a "keep climbing" staircase otherwise.
 * `rank` is 1-based; anything outside 1..3 (or missing) draws the staircase.
 */
export function PodiumArt({ rank, className }: { rank?: number | null; className?: string }) {
  const onPodium = rank === 1 || rank === 2 || rank === 3;
  return (
    <Svg viewBox="0 0 240 180" className={className}>
      <rect width={240} height={180} rx={24} fill={onPodium ? C.amberXL : C.indigoXL} />
      {onPodium ? (
        <g>
          {(
            [
              { place: 2, x: 34, h: 54, color: C.slateL },
              { place: 1, x: 90, h: 76, color: C.amberL },
              { place: 3, x: 146, h: 40, color: C.roseL },
            ] as const
          ).map((b) => {
            const mine = b.place === rank;
            return (
              <g key={b.place}>
                <rect
                  x={b.x}
                  y={160 - b.h}
                  width={60}
                  height={b.h}
                  rx={6}
                  fill={mine ? C.indigo : b.color}
                />
                <Label x={b.x + 30} y={160 - b.h + 30} size={22} fill={mine ? C.white : C.ink}>
                  {b.place}
                </Label>
                {mine ? <Trophy x={b.x + 30} y={160 - b.h - 58} s={34} /> : null}
              </g>
            );
          })}
          <rect x={20} y={158} width={200} height={6} rx={3} fill={C.ink} opacity={0.15} />
          <Sparkle x={30} y={34} r={9} fill={C.amber} />
          <Sparkle x={210} y={40} r={11} fill={C.violet} />
          <circle cx={196} cy={78} r={4} fill={C.rose} />
          <circle cx={44} cy={70} r={4} fill={C.sky} />
          <rect
            x={60}
            y={26}
            width={8}
            height={4}
            rx={2}
            fill={C.emerald}
            transform="rotate(30 64 28)"
          />
          <rect
            x={176}
            y={20}
            width={8}
            height={4}
            rx={2}
            fill={C.rose}
            transform="rotate(-25 180 22)"
          />
        </g>
      ) : (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={30 + i * 44}
              y={140 - i * 26}
              width={44}
              height={20 + i * 26}
              rx={4}
              fill={i === 3 ? C.indigo : C.indigoL}
            />
          ))}
          <path d="M206 36 V62" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
          <path d="M206 36 L230 44 L206 52 Z" fill={C.amber} />
          <path
            d="M44 120 Q90 70 150 70"
            stroke={C.violet}
            strokeWidth={4}
            strokeDasharray="2 9"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M146 62 L156 70 L146 78"
            stroke={C.violet}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Sparkle x={40} y={40} r={10} fill={C.amberL} />
          <Sparkle x={120} y={28} r={7} fill={C.violetL} />
        </g>
      )}
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers for empty states, the guide and achievements                  */
/* -------------------------------------------------------------------------- */

/** Open box with a watch peeking out: for empty lists. */
export function EmptyArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 200 140" className={className}>
      <ellipse cx={100} cy={124} rx={70} ry={8} fill={C.indigoL} opacity={0.35} />
      <Watch
        x={84}
        y={20}
        w={32}
        strap={C.violet}
        screen={(w, h) => (
          <circle cx={w / 2} cy={h / 2} r={w * 0.25} stroke={C.violetL} strokeWidth={2.5} />
        )}
      />
      <path d="M50 72 H150 V118 a6 6 0 0 1 -6 6 H56 a6 6 0 0 1 -6 -6 Z" fill={C.indigo} />
      <path d="M50 72 L34 54 H86 L100 72 Z" fill={C.indigoL} />
      <path d="M150 72 L166 54 H114 L100 72 Z" fill={C.indigoL} />
      <rect x={86} y={86} width={28} height={6} rx={3} fill={C.indigoXL} opacity={0.7} />
      <Sparkle x={160} y={30} r={8} fill={C.amberL} />
      <Sparkle x={38} y={28} r={6} fill={C.violetL} />
    </Svg>
  );
}

/** Open book with a lightbulb and a watch: for the student guide. */
export function GuideArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 240 160" className={className}>
      <rect width={240} height={160} rx={24} fill={C.indigoXL} />
      <path d="M40 58 Q80 46 118 62 V138 Q80 122 40 134 Z" fill={C.white} />
      <path d="M200 58 Q160 46 122 62 V138 Q160 122 200 134 Z" fill={C.white} />
      <path d="M120 62 V140" stroke={C.indigoL} strokeWidth={4} />
      <g stroke={C.indigoL} strokeWidth={4} strokeLinecap="round">
        <path d="M54 76 Q80 70 104 78 M54 92 Q80 86 104 94 M54 108 Q76 103 96 109" />
        <path d="M136 78 Q160 70 186 76 M136 94 Q160 86 186 92" />
      </g>
      <Watch x={150} y={102} w={20} strap={C.emerald} />
      <circle cx={120} cy={30} r={16} fill={C.amberL} />
      <rect x={113} y={44} width={14} height={8} rx={2} fill={C.slate} />
      <path
        d="M120 4 V0 M96 14 L92 10 M144 14 L148 10"
        stroke={C.amber}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Sparkle x={34} y={30} r={8} fill={C.violetL} />
      <Sparkle x={210} y={34} r={9} fill={C.amber} />
    </Svg>
  );
}

const MEDAL_TONE = {
  gold: { disc: C.amber, rim: C.amberL, ribbon: C.rose },
  silver: { disc: '#94a3b8', rim: C.slateL, ribbon: C.indigo },
  bronze: { disc: '#c2410c', rim: '#fdba74', ribbon: C.sky },
  locked: { disc: C.slateL, rim: C.slateXL, ribbon: C.slateL },
} as const;

/** Medal for an achievement tier; pass `locked` for one not earned yet. */
export function MedalArt({
  tier,
  locked = false,
  className,
}: {
  tier: 'gold' | 'silver' | 'bronze';
  locked?: boolean;
  className?: string;
}) {
  const tone = MEDAL_TONE[locked ? 'locked' : tier];
  return (
    <Svg viewBox="0 0 48 56" className={className}>
      <path d="M14 2 H22 L28 22 H20 Z" fill={tone.ribbon} />
      <path d="M34 2 H26 L20 22 H28 Z" fill={tone.ribbon} opacity={0.75} />
      <circle cx={24} cy={36} r={17} fill={tone.disc} />
      <circle cx={24} cy={36} r={12} stroke={tone.rim} strokeWidth={2.5} />
      {locked ? (
        <g>
          <rect x={18} y={34} width={12} height={10} rx={2} fill={C.white} />
          <path
            d="M20.5 34 V31 a3.5 3.5 0 0 1 7 0 V34"
            stroke={C.white}
            strokeWidth={2.2}
            fill="none"
          />
        </g>
      ) : (
        <Star x={24} y={36} r={8} fill={C.white} />
      )}
    </Svg>
  );
}
