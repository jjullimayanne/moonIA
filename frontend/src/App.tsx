import { MoonViewer } from "./map/MoonViewer";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { MapHud } from "./components/MapHud";

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <MoonViewer />
      {/* vignette for depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
      <Header />
      <LeftPanel />
      <RightPanel />
      <BottomPanel />
      <MapHud />
    </div>
  );
}
