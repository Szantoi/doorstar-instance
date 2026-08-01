export const missingDoorStructureContractMessage =
  "A profil alapján alkalmazható ajtólap-, látható tokfelület- és tokborítás-célok még nem rögzíthetők strukturáltan a backendben.";

/** A position may not enter technical review until the backend owns the
 * profile-dependent side, casing and appearance contract. */
export function doorStructureContractBlockers(positionCount: number) {
  return positionCount > 0 ? [missingDoorStructureContractMessage] : [];
}
