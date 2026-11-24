import { lazy, Suspense } from "react";
import { MoonViewer } from "./map/MoonViewer";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { MapHud } from "./components/MapHud";
import { MapTools } from "./components/MapTools";
import { useMoon } from "./store";

const TrainingStudio = lazy(() => import("./pages/TrainingStudio"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const ExperimentsPage = lazy(() => import("./pages/ExperimentsPage"));

export default function App() {
  const page = useMoon((s) => s.page);
  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      {/* the globe stays mounted across modules so returning to the map is instant */}
      <MoonViewer />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
      <Header />
      {page === "explorer" ? (
        <>
          <LeftPanel />
          <RightPanel />
          <BottomPanel />
          <MapHud />
          <MapTools />
        </>
      ) : (
        <Suspense fallback={null}>
          {page === "training" && <TrainingStudio />}
          {page === "pipeline" && <PipelinePage />}
          {page === "registry" && <ExperimentsPage />}
        </Suspense>
      )}
    </div>
  );
}
