/**
 * Build-in-3D Wizard — orchestration hook
 *
 * Holds wizard state and the async actions (create/reuse assets, fetch
 * facility units + auto-match, assemble + save the 3D scene). Pure logic lives
 * in scale.ts / assetSpec.ts / nameMatch.ts / sceneBuild.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssetService } from '../../services/AssetService';
import {
  getBluLokFacilities,
  getBluLokUnits,
  saveFacility,
  uploadLayoutSource,
  deleteFacility,
  type BluLokFacility,
  type BluLokUnit,
} from '@/api/bludesign';
import type { EditableUnit } from '../types';
import type { LoadedSource } from '../loadSource';
import {
  bucketToAssetInput,
  bucketUnits,
  resolveAssetIdForBucket,
  signatureOf,
  type ResolvedAssetBucket,
  DEFAULT_TOLERANCE_M,
} from './assetSpec';
import { autoMatch, type MatchCandidate } from './nameMatch';
import { buildFacilityData } from './sceneBuild';

export type WizardStep = 'scale' | 'assets' | 'match' | 'build';

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'scale', label: 'Scale' },
  { id: 'assets', label: 'Assets' },
  { id: 'match', label: 'Units' },
  { id: 'build', label: 'Build' },
];

export interface UseBuildWizardArgs {
  units: EditableUnit[];
  defaultSceneName?: string;
  source?: LoadedSource | null;
}

export interface BuildWizardController {
  step: WizardStep;
  goNext: () => void;
  goBack: () => void;
  goStep: (s: WizardStep) => void;
  canGoNext: boolean;

  // Stage 1 — scale
  metersPerPixel: number;
  setMetersPerPixel: (v: number) => void;

  // Stage 2 — assets
  toleranceM: number;
  setToleranceM: (v: number) => void;
  buckets: ResolvedAssetBucket[];
  assetsBusy: boolean;
  assetsCreated: boolean;
  assetError: string | null;
  assetsReused: number;
  assetsCreatedCount: number;
  generateAssets: () => Promise<void>;
  unitsWithAsset: number;

  // Stage 3: match
  facilities: BluLokFacility[];
  facilitiesBusy: boolean;
  facilitiesError: string | null;
  facilityId: string | null;
  realUnits: BluLokUnit[];
  matchBusy: boolean;
  matchError: string | null;
  assignments: Record<string, string | null>;
  candidates: Record<string, MatchCandidate[]>;
  loadFacilities: () => Promise<void>;
  selectFacility: (id: string) => Promise<void>;
  setAssignment: (diagramUnitId: string, realUnitId: string | null) => void;
  matchedCount: number;

  // Stage 4 — build
  sceneName: string;
  setSceneName: (v: string) => void;
  buildBusy: boolean;
  buildError: string | null;
  savedFacilityId: string | null;
  buildAndSave: () => Promise<string | null>;
}

export function useBuildWizard({ units, defaultSceneName, source }: UseBuildWizardArgs): BuildWizardController {
  const [step, setStep] = useState<WizardStep>('scale');

  const [metersPerPixel, setMetersPerPixel] = useState(0);

  const [toleranceM, setToleranceM] = useState(DEFAULT_TOLERANCE_M);
  const [buckets, setBuckets] = useState<ResolvedAssetBucket[]>([]);
  const [assetIdByUnitId, setAssetIdByUnitId] = useState<Record<string, string>>({});
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [assetsCreated, setAssetsCreated] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [facilities, setFacilities] = useState<BluLokFacility[]>([]);
  const [facilitiesBusy, setFacilitiesBusy] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [realUnits, setRealUnits] = useState<BluLokUnit[]>([]);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [candidates, setCandidates] = useState<Record<string, MatchCandidate[]>>({});

  const [sceneName, setSceneName] = useState(defaultSceneName ?? 'Imported facility');
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [savedFacilityId, setSavedFacilityId] = useState<string | null>(null);

  const labeledUnits = useMemo(() => units.filter((u) => u.kind === 'unit' || u.label), [units]);

  const unitsWithAsset = useMemo(
    () => labeledUnits.filter((u) => assetIdByUnitId[u.id]).length,
    [labeledUnits, assetIdByUnitId]
  );

  const matchedCount = useMemo(
    () => Object.values(assignments).filter(Boolean).length,
    [assignments]
  );

  const assetsReused = useMemo(
    () => buckets.filter((b) => b.matchKind !== 'created').length,
    [buckets]
  );

  const assetsCreatedCount = useMemo(
    () => buckets.filter((b) => b.matchKind === 'created').length,
    [buckets]
  );

  // Re-resolve assets when scale or tolerance changes.
  useEffect(() => {
    setAssetsCreated(false);
    setBuckets([]);
    setAssetIdByUnitId({});
    setAssetError(null);
  }, [metersPerPixel, toleranceM]);

  const facilityName = useMemo(
    () => facilities.find((f) => f.id === facilityId)?.name ?? '',
    [facilities, facilityId]
  );

  // --- Stage 2: assets -----------------------------------------------------
  const generateAssets = useCallback(async () => {
    if (!(metersPerPixel > 0)) return;
    setAssetsBusy(true);
    setAssetError(null);
    try {
      const computed = bucketUnits(labeledUnits, metersPerPixel, { toleranceM });
      const existing = await AssetService.getAssetDefinitions({
        isBuiltin: false,
        forceRefresh: true,
      });
      const matchable = existing.filter((def) => def.category === 'storage_unit');
      const sigToId = new Map<string, string>();
      for (const def of matchable) {
        const sig = signatureOf(def.description);
        if (sig) sigToId.set(sig, def.id);
      }

      const idByUnit: Record<string, string> = {};
      const resolvedBuckets: ResolvedAssetBucket[] = [];

      for (const bucket of computed) {
        const resolution = resolveAssetIdForBucket(bucket, sigToId, matchable, toleranceM);
        let assetId: string;
        let matchKind: ResolvedAssetBucket['matchKind'];

        if (resolution) {
          assetId = resolution.assetId;
          matchKind = resolution.matchKind;
        } else {
          const created = await AssetService.createAssetDefinition(bucketToAssetInput(bucket));
          assetId = created.id;
          matchKind = 'created';
          sigToId.set(bucket.signature, assetId);
          matchable.push(created);
        }

        resolvedBuckets.push({ ...bucket, assetId, matchKind });
        for (const unitId of bucket.unitIds) idByUnit[unitId] = assetId;
      }

      setBuckets(resolvedBuckets);
      setAssetIdByUnitId(idByUnit);
      setAssetsCreated(true);
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : 'Failed to create assets');
      setAssetsCreated(false);
    } finally {
      setAssetsBusy(false);
    }
  }, [labeledUnits, metersPerPixel, toleranceM]);

  // --- Stage 3: match ------------------------------------------------------
  const loadFacilities = useCallback(async () => {
    setFacilitiesBusy(true);
    setFacilitiesError(null);
    try {
      setFacilities(await getBluLokFacilities());
    } catch (err) {
      setFacilitiesError(err instanceof Error ? err.message : 'Failed to load facilities');
      setFacilities([]);
    } finally {
      setFacilitiesBusy(false);
    }
  }, []);

  const selectFacility = useCallback(
    async (id: string) => {
      setFacilityId(id);
      setMatchBusy(true);
      setMatchError(null);
      try {
        const fetched = await getBluLokUnits(id);
        setRealUnits(fetched);
        const result = autoMatch(
          labeledUnits.map((u) => ({ id: u.id, label: u.label ?? '' })),
          fetched.map((u) => ({ id: u.id, unit_number: u.unit_number }))
        );
        setAssignments(result.assignments);
        setCandidates(result.candidates);
      } catch (err) {
        setMatchError(err instanceof Error ? err.message : 'Failed to load facility units');
        setRealUnits([]);
        setAssignments({});
        setCandidates({});
      } finally {
        setMatchBusy(false);
      }
    },
    [labeledUnits]
  );

  const setAssignment = useCallback((diagramUnitId: string, realUnitId: string | null) => {
    setAssignments((prev) => {
      const next = { ...prev };
      // Keep one-to-one: clear any other diagram unit already bound to this real unit.
      if (realUnitId) {
        for (const key of Object.keys(next)) {
          if (key !== diagramUnitId && next[key] === realUnitId) next[key] = null;
        }
      }
      next[diagramUnitId] = realUnitId;
      return next;
    });
  }, []);

  // --- Stage 4: build ------------------------------------------------------
  const buildAndSave = useCallback(async (): Promise<string | null> => {
    if (!source?.width || !source?.height) {
      setBuildError('Import source image is missing — re-upload the plan and try again.');
      return null;
    }
    setBuildBusy(true);
    setBuildError(null);
    let savedId: string | null = null;
    try {
      const bindingByUnitId: Record<string, string> = {};
      for (const [diagramId, realId] of Object.entries(assignments)) {
        if (realId) bindingByUnitId[diagramId] = realId;
      }
      const data = buildFacilityData({
        units: labeledUnits,
        metersPerPixel,
        assetIdByUnitId,
        bindingByUnitId,
        facility: facilityId ? { id: facilityId, name: facilityName } : null,
        sceneName: sceneName.trim() || 'Imported facility',
        imageWidth: source.width,
        imageHeight: source.height,
      });
      const saved = await saveFacility(data.name, data);
      savedId = saved.id;
      if (source.uploadFile) {
        await uploadLayoutSource(saved.id, source.uploadFile);
      }
      setSavedFacilityId(saved.id);
      return saved.id;
    } catch (err) {
      if (savedId) {
        try {
          await deleteFacility(savedId);
        } catch {
          /* best-effort rollback */
        }
      }
      setBuildError(err instanceof Error ? err.message : 'Failed to save facility');
      return null;
    } finally {
      setBuildBusy(false);
    }
  }, [assignments, labeledUnits, metersPerPixel, assetIdByUnitId, facilityId, facilityName, sceneName, source]);

  // --- Navigation ----------------------------------------------------------
  const canGoNext = useMemo(() => {
    switch (step) {
      case 'scale':
        return metersPerPixel > 0;
      case 'assets':
        return assetsCreated && unitsWithAsset > 0;
      case 'match':
        return true; // matching is optional; unmatched units are placed unbound
      case 'build':
        return false;
    }
  }, [step, metersPerPixel, assetsCreated, unitsWithAsset]);

  const goStep = useCallback((s: WizardStep) => setStep(s), []);
  const goNext = useCallback(() => {
    setStep((s) => {
      const idx = WIZARD_STEPS.findIndex((w) => w.id === s);
      return WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)].id;
    });
  }, []);
  const goBack = useCallback(() => {
    setStep((s) => {
      const idx = WIZARD_STEPS.findIndex((w) => w.id === s);
      return WIZARD_STEPS[Math.max(idx - 1, 0)].id;
    });
  }, []);

  return {
    step,
    goNext,
    goBack,
    goStep,
    canGoNext,

    metersPerPixel,
    setMetersPerPixel,

    toleranceM,
    setToleranceM,
    buckets,
    assetsBusy,
    assetsCreated,
    assetError,
    assetsReused,
    assetsCreatedCount,
    generateAssets,
    unitsWithAsset,

    facilities,
    facilitiesBusy,
    facilitiesError,
    facilityId,
    realUnits,
    matchBusy,
    matchError,
    assignments,
    candidates,
    loadFacilities,
    selectFacility,
    setAssignment,
    matchedCount,

    sceneName,
    setSceneName,
    buildBusy,
    buildError,
    savedFacilityId,
    buildAndSave,
  };
}
