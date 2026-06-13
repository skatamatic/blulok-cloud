/**

 * Editor floating panel — resizable import plan preview with image toggle.

 */



import React, { useCallback, useEffect, useRef, useState } from 'react';

import {

  ArrowPathIcon,

  EyeIcon,

  EyeSlashIcon,

  InformationCircleIcon,

  PhotoIcon,

} from '@heroicons/react/24/outline';

import { useTheme } from '@/contexts/ThemeContext';

import { FloatingPanel } from '../ui/FloatingPanel';

import {

  ImportedLayoutViewer,

  type ImportedLayoutViewerHandle,

} from '../layout-import/ImportedLayoutViewer';

import {

  layoutImportToEditableUnits,

  type LayoutImportMetadata,

} from '../layout-import/layoutImportMetadata';

import { fetchLayoutSourceObjectUrl } from '@/api/bludesign';



interface ImportPlanPanelProps {

  facilityId: string;

  layoutImport: LayoutImportMetadata;

  boundsRef: React.RefObject<HTMLDivElement>;

  visible: boolean;

  onClose: () => void;

}



export const ImportPlanPanel: React.FC<ImportPlanPanelProps> = ({

  facilityId,

  layoutImport,

  boundsRef,

  visible,

  onClose,

}) => {

  const { effectiveTheme } = useTheme();

  const isDark = effectiveTheme === 'dark';

  const viewerRef = useRef<ImportedLayoutViewerHandle>(null);

  const imageUrlRef = useRef<string | null>(null);

  const [showImage, setShowImage] = useState(true);

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [imageLoading, setImageLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);



  const units = layoutImportToEditableUnits(layoutImport);



  const revokeImageUrl = useCallback((url: string | null) => {

    if (url) URL.revokeObjectURL(url);

  }, []);



  const assignImageUrl = useCallback(

    (url: string | null) => {

      revokeImageUrl(imageUrlRef.current);

      imageUrlRef.current = url;

      setImageUrl(url);

    },

    [revokeImageUrl]

  );



  const loadImage = useCallback(async (signal: { cancelled: boolean }) => {

    assignImageUrl(null);

    setLoadError(null);

    setImageLoading(true);

    try {

      const url = await fetchLayoutSourceObjectUrl(facilityId);

      if (signal.cancelled) {

        URL.revokeObjectURL(url);

        return;

      }

      assignImageUrl(url);

    } catch {

      if (!signal.cancelled) setLoadError('Import image unavailable');

    } finally {

      if (!signal.cancelled) setImageLoading(false);

    }

  }, [facilityId, assignImageUrl]);



  useEffect(() => {

    const signal = { cancelled: false };

    void loadImage(signal);

    return () => {

      signal.cancelled = true;

    };

  }, [facilityId, reloadKey, loadImage]);



  useEffect(

    () => () => {

      revokeImageUrl(imageUrlRef.current);

      imageUrlRef.current = null;

    },

    [revokeImageUrl]

  );



  const handleFit = useCallback(() => viewerRef.current?.fit(), []);

  const handleRetry = useCallback(() => setReloadKey((k) => k + 1), []);



  if (!visible) return null;



  return (

    <FloatingPanel

      id="import-plan"

      title="Import Plan"

      icon={<PhotoIcon className="w-4 h-4" />}

      position={{

        x: 24,

        y: 80,

        width: 360,

        height: 320,

        collapsed: false,

      }}

      anchor="bottom-left"

      defaultWidth={360}

      minWidth={240}

      maxWidth={720}

      defaultHeight={320}

      minHeight={200}

      maxHeight={600}

      resizable

      resizableHeight

      zIndex={45}

      boundsRef={boundsRef}

      closable

      onClose={onClose}

      onStateChange={() => {}}

    >

      {(width, height) => (

        <div className="flex h-full flex-col" style={{ width, height: height ?? 320 }}>

          <div

            className={`flex items-center gap-2 px-2 py-1.5 border-b text-[10px] ${

              isDark ? 'border-gray-800 text-gray-400 bg-gray-900/50' : 'border-gray-200 text-gray-500 bg-gray-50/80'

            }`}

          >

            <InformationCircleIcon className="w-3.5 h-3.5 flex-shrink-0 text-primary-500" />

            <span>Original import layout — positions reflect detection at import time.</span>

          </div>

          <div

            className={`flex items-center justify-between gap-2 px-2 py-1.5 border-b text-xs ${

              isDark ? 'border-gray-800 text-gray-300' : 'border-gray-200 text-gray-600'

            }`}

          >

            <button

              type="button"

              onClick={() => setShowImage((v) => !v)}

              aria-label={showImage ? 'Hide plan image' : 'Show plan image'}

              className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${

                isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'

              }`}

            >

              {showImage ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeSlashIcon className="w-3.5 h-3.5" />}

              {showImage ? 'Hide plan image' : 'Show plan image'}

            </button>

            <div className="flex items-center gap-1">

              {loadError && (

                <button

                  type="button"

                  onClick={handleRetry}

                  title="Retry loading plan image"

                  aria-label="Retry loading plan image"

                  className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${

                    isDark ? 'hover:bg-gray-800 text-error-400' : 'hover:bg-gray-100 text-error-600'

                  }`}

                >

                  <ArrowPathIcon className="w-3.5 h-3.5" />

                  Retry

                </button>

              )}

              <button

                type="button"

                onClick={handleFit}

                aria-label="Fit facility to panel"

                className={`rounded-md px-2 py-1 transition-colors ${

                  isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'

                }`}

              >

                Fit

              </button>

            </div>

          </div>

          <div className="relative min-h-0 flex-1">

            {imageLoading && (

              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">

                <div className="h-6 w-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />

              </div>

            )}

            {loadError && !imageUrl && (

              <div

                className={`absolute inset-x-0 top-2 z-10 text-center text-xs px-3 ${

                  isDark ? 'text-gray-500' : 'text-gray-500'

                }`}

              >

                {loadError}. Vector overlay still available.

              </div>

            )}

            <ImportedLayoutViewer

              ref={viewerRef}

              imageWidth={layoutImport.imageWidth}

              imageHeight={layoutImport.imageHeight}

              units={units}

              imageUrl={imageUrl}

              showImage={showImage && !!imageUrl}

              showLabels

            />

          </div>

        </div>

      )}

    </FloatingPanel>

  );

};



export default ImportPlanPanel;


