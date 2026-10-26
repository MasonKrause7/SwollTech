import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { Loading } from "./components/Feedback";
import { Shell } from "./Shell";
import { AccountPage } from "./pages/Account";
import { ResetPage, SignInPage, SignUpPage, UpdatePasswordPage } from "./pages/AuthPages";
import { ExercisesPage } from "./pages/Exercises";
import { HistoryPage } from "./pages/History";
import { HomePage } from "./pages/Home";
import { SessionPage } from "./pages/Session";
import { SummaryPage } from "./pages/Summary";
import { EditorPage, WorkoutsPage } from "./pages/Workouts";

const ProgressPage = lazy(() => import("./pages/Progress").then((module) => ({ default: module.ProgressPage })));
const ExerciseProgressPage = lazy(() => import("./pages/Progress").then((module) => ({ default: module.ExerciseProgressPage })));

function Guard({ children }: { children: React.ReactNode }) {
  const { signedIn, ready, recovering } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (recovering) return <Navigate to="/update-password" replace />;
  if (!signedIn) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />
      <Route
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="workouts/new" element={<EditorPage />} />
        <Route path="workouts/:workoutId" element={<EditorPage />} />
        <Route path="sessions/:sessionId" element={<SessionPage />} />
        <Route path="sessions/:sessionId/summary" element={<SummaryPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route path="progress" element={<Suspense fallback={<Loading />}><ProgressPage /></Suspense>} />
        <Route path="progress/:exerciseId" element={<Suspense fallback={<Loading />}><ExerciseProgressPage /></Suspense>} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
