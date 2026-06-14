import type { FacilityData } from '../core/types';

/** Passed from the import wizard to the editor without persisting to the server. */
export interface ImportEditorHandoff {
  sceneName: string;
  data: FacilityData;
  layoutSourceFile?: File;
}

export const IMPORT_EDITOR_HANDOFF_STATE_KEY = 'importHandoff';
