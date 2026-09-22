import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Navbar from "./components/ui/Navbar";

const Home = lazy(() => import("./pages/Home").then((module) => ({ default: module.Home })));
const Rooms = lazy(() => import("./pages/Rooms"));
const ManageFurniture = lazy(() => import("./pages/ManageFurniture"));
const EditorPlaceholder = lazy(() => import("./pages/EditorPlaceholder"));
const Preference = lazy(() => import("./pages/Preference"));
const ReferenceImage = lazy(() => import("./pages/ReferenceImage"));
const Recommendation = lazy(() => import("./pages/Recommendation"));
const LayoutConfirm = lazy(() => import("./pages/LayoutConfirm"));

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <div className="pt-19">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/manage-furniture" element={<ManageFurniture />} />
            <Route path="/preference" element={<Preference />} />
            <Route path="/reference-image" element={<ReferenceImage />} />
            <Route path="/recommendation" element={<Recommendation />} />
            <Route path="/editor" element={<EditorPlaceholder />} />
            <Route path="/layout-confirm" element={<LayoutConfirm />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

function RouteLoadingFallback() {
  return (
    <main className="grid min-h-[calc(100vh-76px)] place-items-center bg-[#fbfbfb] text-sm font-semibold text-[#777777]">
      화면을 준비하는 중...
    </main>
  );
}
