/** Session-only flag: skip asset delete confirmation until page refresh. */
let skipAssetDeleteConfirm = false;

export function shouldSkipAssetDeleteConfirm(): boolean {
  return skipAssetDeleteConfirm;
}

export function setSkipAssetDeleteConfirm(skip: boolean): void {
  skipAssetDeleteConfirm = skip;
}
