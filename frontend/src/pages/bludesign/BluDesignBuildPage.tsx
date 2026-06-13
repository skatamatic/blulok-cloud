import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EditorCanvas } from '@/components/bludesign';

export default function BluDesignBuildPage() {
  const [searchParams] = useSearchParams();
  // When handed off from the layout-import "Build in 3D" wizard, open the
  // freshly-created facility directly in the editor.
  const initialFacilityId = searchParams.get('facilityId') ?? undefined;

  const handleReady = useCallback(() => {
    console.log('BluDesign Editor ready');
  }, []);

  return (
    // Break out of DashboardLayout padding to fill full content area
    // DashboardLayout applies: paddingLeft/Right: 7%, py-6 (1.5rem top/bottom)
    // Position relative to the grandparent (main element) to fill the entire content area
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
        className="w-full h-full"
      />
    </div>
  );
}
