import { useAppSelector } from "@/store/hooks";

/**
 * The organisation the current screen works on: a client's own, or the one staff picked in the
 * "Viewing" menu. When there isn't one, `problem` says why in words the person can act on.
 */
export function useActiveTenant() {
  const user = useAppSelector((state) => state.auth.user);
  const selected = useAppSelector((state) => state.modules.selectedTenantId);
  const isStaff = !!user && user.platformRole !== "CLIENT";
  const tenantId = (isStaff ? selected : user?.tenant?.id) || null;
  const problem = tenantId || !user ? null
    : isStaff ? "Choose a client from the “Viewing” menu at the top first. If the menu is empty, no clients have been created yet."
    : "Your account isn't linked to an active organisation yet. Please contact TOFAA to get this fixed.";
  return { tenantId, problem };
}
