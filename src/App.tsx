import { BasePage } from "./components/BasePage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SoundToggle } from "./components/SoundToggle";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { ResultPage } from "./pages/ResultPage";
import { useZombieEngine } from "./hooks/useZombieEngine";

function App() {
  const { canvasRef, state, muted, devStart, actions } = useZombieEngine();

  const slots =
    state.phase === "home"
      ? HomePage({ highScore: state.highScore, onStart: actions.startGame, devStart, onDevStartChange: actions.setDevStart })
      : state.phase === "playing"
        ? BattlePage({
            stage: state.stage,
            areaName: state.areaName,
            stageBanner: state.stageBanner,
            score: state.score,
            lives: state.lives,
            ammo: state.ammo,
            reloading: state.reloading,
            weapon: state.weapon,
            weaponAmmo: state.weaponAmmo,
            onSelectWeapon: actions.selectWeapon,
            bossHp: state.bossHp,
            bossWarning: state.bossWarning,
            exitOpen: state.exitOpen,
            onMove: actions.move,
            hintVisible: state.hintVisible,
            onReload: actions.reload,
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
      <SoundToggle muted={muted} onToggle={actions.toggleMuted} />
      <LoadingOverlay ready={state.assetsReady} />
    </>
  );
}

export default App;
