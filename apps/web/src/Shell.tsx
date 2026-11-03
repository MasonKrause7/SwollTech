import { CalendarDays, ChartLine, Dumbbell, History, House, ListChecks, LogOut, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

const links = [
  { to: "/", label: "Today", icon: House },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/workouts", label: "Workouts", icon: ListChecks },
  { to: "/history", label: "History", icon: History },
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
          <img className="brand-mark" src="/art/mascot-mark.webp" alt="" width={32} height={32} />
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
