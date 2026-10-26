import { CalendarDays, ChartLine, Dumbbell, House, ListChecks, LogOut, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1B2027" />
      <rect x="6" y="29" width="52" height="6" rx="2" fill="#8C96A0" />
      <rect x="14" y="14" width="8" height="36" rx="2" fill="#D7263D" />
      <rect x="24" y="19" width="6" height="26" rx="2" fill="#F2C230" />
      <rect x="42" y="14" width="8" height="36" rx="2" fill="#D7263D" />
      <rect x="34" y="19" width="6" height="26" rx="2" fill="#F2C230" />
    </svg>
  );
}

const links = [
  { to: "/", label: "Today", icon: House },
  { to: "/workouts", label: "Workouts", icon: ListChecks },
  { to: "/history", label: "History", icon: CalendarDays },
  { to: "/progress", label: "Progress", icon: ChartLine },
  { to: "/exercises", label: "Exercises", icon: Dumbbell, desktopOnly: true },
  { to: "/account", label: "Account", icon: UserRound },
];

export function Shell() {
  const { signOut } = useAuth();
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <NavLink to="/" className="brand">
          <Logo />
          SwollTech
        </NavLink>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `navlink${isActive ? " active" : ""}`}>
            <Icon size={20} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        <div className="spacer" />
        <button className="navlink" onClick={() => signOut()}>
          <LogOut size={20} aria-hidden="true" />
          Sign out
        </button>
      </nav>
      <main className="main" id="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {links
          .filter((link) => !link.desktopOnly)
          .map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon size={22} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
