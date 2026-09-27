import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ZombieEngine, type EngineState, type StartOptions } from "../lib/engine";
import { loadMuted, SoundManager } from "../lib/sound";
import { DEV_TOOLS, MAX_AMMO, PLAYER_START_LIVES } from "../lib/constants";

export function useZombieEngine() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ZombieEngine | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const [muted, setMutedState] = useState(loadMuted);
  const [state, setState] = useState<EngineState>({
    phase: "home",
    score: 0,
    lives: PLAYER_START_LIVES,
    ammo: MAX_AMMO,
    reloading: false,
    stage: 1,
    stageBanner: null,
    bossHp: null,
    bossWarning: false,
    hintVisible: false,
    highScore: 0,
    isNewRecord: false,
    assetsReady: false,
  });

  // useEffectだとブラウザが一度ペイントした後に実行されるため、
  // 初期状態(canvasの初期サイズ300x150)がごく一瞬見えてしまうことがある。
  // useLayoutEffectでペイント前に実サイズへ張り直す。
  useLayoutEffect(() => {
    const sound = new SoundManager();
    soundRef.current = sound;
    const engine = new ZombieEngine(setState, sound);
    engineRef.current = engine;
    if (canvasRef.current) engine.init(canvasRef.current);
    // 開発用: ブラウザのコンソールからエンジンを触れるようにする
    if (DEV_TOOLS) (window as unknown as { __engine?: ZombieEngine }).__engine = engine;
    return () => {
      engine.dispose();
      sound.dispose();
      engineRef.current = null;
      soundRef.current = null;
    };
  }, []);

  // 開発用のスタート設定(ステージ・ボスから)。結果画面の「もう一度」でも同じ設定で始める
  const [devStart, setDevStart] = useState<Required<StartOptions>>({ stageIndex: 0, startAtBoss: false });
  const startGame = useCallback(() => engineRef.current?.startGame(DEV_TOOLS ? devStart : {}), [devStart]);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);
  const reload = useCallback(() => engineRef.current?.reload(), []);
  const toggleMuted = useCallback(() => {
    const sound = soundRef.current;
    if (!sound) return;
    sound.setMuted(!sound.isMuted());
    setMutedState(sound.isMuted());
  }, []);

  // useEffect依存配列でactions全体を使えるよう、参照を安定させる
  const actions = useMemo(() => ({ startGame, goHome, reload, toggleMuted, setDevStart }), [startGame, goHome, reload, toggleMuted]);

  return { canvasRef, state, muted, devStart, actions };
}
