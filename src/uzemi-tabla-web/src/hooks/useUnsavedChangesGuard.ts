import { useCallback, useEffect, useRef } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { useConfirmStore } from "../store/confirmStore";

const leaveMessage = "Nem mentett módosításaid vannak. Biztosan elhagyod ezt a munkateret?";

/** Protects a local office draft from both SPA navigation and browser
 * refresh/close. Call allowNextNavigation only after a successful terminal
 * action that intentionally leaves the page. */
export function useUnsavedChangesGuard(enabled: boolean) {
  const bypassRef = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    enabled
    && !bypassRef.current
    && `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`,
  );

  useBeforeUnload(useCallback((event) => {
    if (!enabled || bypassRef.current) return;
    event.preventDefault();
    event.returnValue = "";
  }, [enabled]));

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    const { proceed, reset } = blocker;
    void useConfirmStore.getState().ask(leaveMessage).then((accepted) => {
      if (!active) return;
      if (accepted) proceed();
      else reset();
    });
    return () => { active = false; };
  }, [blocker]);

  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return { allowNextNavigation };
}
