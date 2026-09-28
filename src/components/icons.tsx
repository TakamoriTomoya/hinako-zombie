import type { SVGProps } from "react";

// ボタン用のSVGアイコン群。色はcurrentColor、太めの線と丸い端で統一する
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 22, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
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

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="M11 5l-7 7 7 7" />
    </Icon>
  );
}

// やり直し(左回りの矢印)
export function RestartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" />
      <path d="M4 4v5h5" />
    </Icon>
  );
}

// 音あり(スピーカーと音の波)
export function SoundOnIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </Icon>
  );
}

// 音なし(スピーカーとばつ印)
export function SoundOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5" />
      <path d="M21 9.5l-5 5" />
    </Icon>
  );
}

// ライフ(塗りつぶしたハート)
export function HeartIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="#ffffff" strokeWidth={2} {...props}>
      <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
    </Icon>
  );
}

// ---- 武器(塗りつぶしの小さな絵) ----

export function PistolIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <path d="M3 7h15v4h-9l-1.5 7H4l1.5-7H3z" />
      <rect x="17" y="6" width="3" height="2" rx="0.5" />
    </Icon>
  );
}

export function MachineGunIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <path d="M1 8h17v3H9l-1 3H6l.5-3H1z" />
      <rect x="18" y="8.8" width="5" height="1.4" />
      <path d="M9.5 11h2.5l-1 6H8.5z" />
      <rect x="3" y="11" width="3" height="5" rx="0.8" />
    </Icon>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <rect x="2" y="8" width="17" height="5" rx="1" />
      <path d="M19 7.5l4 3-4 3z" />
      <rect x="7" y="13" width="2.5" height="4" rx="0.5" />
      <rect x="12" y="13" width="2.5" height="3" rx="0.5" />
    </Icon>
  );
}

export function GrenadeIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <ellipse cx="11" cy="14.5" rx="6" ry="7" />
      <rect x="8.5" y="5" width="5" height="3" rx="0.8" />
      <circle cx="17" cy="5.5" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.6} />
    </Icon>
  );
}

export function ShotgunIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <rect x="1" y="8" width="21" height="2.6" rx="0.6" />
      <rect x="1" y="10.8" width="15" height="1.8" rx="0.6" />
      <rect x="10" y="12.4" width="5" height="2.4" rx="0.6" />
      <path d="M1 9h4l-1 7H1.5z" />
    </Icon>
  );
}

export function SniperIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <rect x="1" y="10" width="22" height="1.8" rx="0.5" />
      <rect x="7" y="6.5" width="8" height="2.6" rx="1.3" />
      <rect x="10" y="9" width="1.5" height="1.5" />
      <path d="M1 10.5h5l-1.5 6H1.5z" />
      <path d="M8 11.5h2l-.8 4H7.5z" />
    </Icon>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={0} fill="currentColor">
      <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.2C9.8 10 10.5 12 12 12c0-3-1.5-6 0-10z" />
    </Icon>
  );
}

// 一時停止(縦の2本線)
export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </Icon>
  );
}
