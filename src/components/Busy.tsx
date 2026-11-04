export function Busy({ on, children, wait }: { on: boolean; children: React.ReactNode; wait: string }) {
  return (
    <>
      {on ? <span className="spinner" aria-hidden="true" /> : null}
      {on ? wait : children}
    </>
  );
}
