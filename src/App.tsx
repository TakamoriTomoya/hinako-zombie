import { BasePage } from "./components/BasePage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SoundToggle } from "./components/SoundToggle";
import { PauseMenu } from "./components/PauseMenu";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { ResultPage } from "./pages/ResultPage";
import { useZombieEngine } from "./hooks/useZombieEngine";

function App() {
  const { canvasRef, state, muted, devStart, actions } = useZombieEngine();

  const slots =
    state.phase === "home"
      ? HomePage({ highScore: state.highScore, onStart: actions.startGame, devStart, onDevStartChange: actions.setDevStart, muted, onToggleMuted: actions.toggleMuted })
      : state.phase === "playing"
        ? BattlePage({
            stage: state.stage,
            areaName: state.areaName,
            stageBanner: state.stageBanner,
            score: state.score,
            lives: state.lives,
            weapon: state.weapon,
            weaponAmmo: state.weaponAmmo,
            onSelectWeapon: actions.selectWeapon,
            bossHp: state.bossHp,
            bossWarning: state.bossWarning,
            exitOpen: state.exitOpen,
            advanceHint: state.advanceHint,
            onMove: actions.move,
            onPause: actions.pause,
            hintVisible: state.hintVisible,
          })
        : ResultPage({
            cleared: state.phase === "clear",
            stage: state.stage,
            score: state.score,
            highScore: state.highScore,
            isNewRecord: state.isNewRecord,
            onHome: actions.goHome,
            onRestart: actions.startGame,
          });

  return (
    <>
      <BasePage canvasRef={canvasRef} {...slots} />
      {/* 戦っている間は出さない(音のオン/オフは一時停止メニューから) */}
      {/* 結果画面は左下に出す(トップ画面は上の帯の中、戦っている間は一時停止メニューの中) */}
      {(state.phase === "gameover" || state.phase === "clear") && <SoundToggle muted={muted} onToggle={actions.toggleMuted} placement="bottom-left" />}
      {state.paused && state.phase === "playing" && (
        <PauseMenu muted={muted} onResume={actions.resume} onRestart={actions.startGame} onHome={actions.goHome} onToggleMuted={actions.toggleMuted} />
      )}
      <LoadingOverlay ready={state.assetsReady} />
    </>
  );
}

export default App;
