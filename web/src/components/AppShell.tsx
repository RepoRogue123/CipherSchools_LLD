import { Link, NavLink, Outlet } from 'react-router';
import { useLearner } from '../learner';

export function AppShell() {
  const { learner, switchLearner } = useLearner();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded px-2 py-1 text-[0.9375rem] ${isActive ? 'font-semibold text-ink' : 'text-ink-soft hover:text-cobalt'}`;
  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="text-[1.3rem] font-bold text-cobalt [font-stretch:118%]">
            DesignLoop
          </Link>
          <nav aria-label="Main" className="flex gap-2">
            <NavLink to="/" end className={navClass}>
              Problems
            </NavLink>
            <NavLink to="/rubric" className={navClass}>
              How you’re assessed
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <span>
              Practising as <span className="font-semibold text-ink">{learner.name}</span>
            </span>
            <button type="button" className="btn btn-quiet text-sm" onClick={switchLearner}>
              Switch
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
