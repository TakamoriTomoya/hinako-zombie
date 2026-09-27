import { useRef, useState, type PointerEvent } from "react";

interface Props {
  onMove: (x: number, y: number) => void; // x: 右が+、y: 前が+(どちらも -1〜1)
}

const RADIUS = 48; // スティックが動ける半径(px)

// 画面の左下に置く、歩くためのスティック。指で押してずらした方向へ歩く(PCでは WASD キーでも)
export function Joystick({ onMove }: Props) {
  const center = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: PointerEvent<HTMLDivElement>) => {
    const c = center.current;
    if (!c) return;
    let dx = e.clientX - c.x;
    let dy = e.clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / RADIUS, -dy / RADIUS);
  };

  const release = () => {
    center.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className="pointer-events-auto relative h-32 w-32 touch-none select-none rounded-full border-2 border-white/30 bg-white/10"
      aria-label="あるく"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={update}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div
        className="absolute top-1/2 left-1/2 h-14 w-14 rounded-full border-2 border-white/60 bg-white/35 shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
