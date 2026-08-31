import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { EditorCanvas } from '@/components/bludesign';
import {
  IMPORT_EDITOR_HANDOFF_STATE_KEY,
  type ImportEditorHandoff,
} from '@/components/bludesign/layout-import/importEditorHandoff';

export default function BluDesignBuildPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialFacilityId = searchParams.get('facilityId') ?? undefined;

  const initialImportHandoff = useMemo(() => {
    const state = location.state as Record<string, unknown> | null;
    const handoff = state?.[IMPORT_EDITOR_HANDOFF_STATE_KEY];
    if (!handoff || typeof handoff !== 'object') return undefined;
    return handoff as ImportEditorHandoff;
  }, [location.state]);

  const handleReady = useCallback(() => {
    console.log('BluDesign Editor ready');
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <EditorCanvas
        readonly={false}
        onReady={handleReady}
        initialFacilityId={initialFacilityId}
        initialImportHandoff={initialImportHandoff}
        className="w-full h-full"
      />
    </div>
  );
}
