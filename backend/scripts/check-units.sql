-- Check units in facility 2d2c3b76-d46e-408e-84c7-e8f8996c4d4a
SELECT id, unit_number, facility_id, status, unit_type 
FROM units 
WHERE facility_id = '2d2c3b76-d46e-408e-84c7-e8f8996c4d4a'
ORDER BY unit_number;

-- Check FMS entity mappings for units
SELECT 
  fem.id,
  fem.external_id,
  fem.internal_id,
  fem.entity_type,
  u.unit_number,
  u.facility_id as unit_facility_id,
  fem.facility_id as mapping_facility_id
FROM fms_entity_mappings fem
LEFT JOIN units u ON u.id = fem.internal_id
WHERE fem.facility_id = '2d2c3b76-d46e-408e-84c7-e8f8996c4d4a'
  AND fem.entity_type = 'unit'
ORDER BY fem.external_id;

-- Check for duplicate internal_id mappings
SELECT 
  facility_id,
  entity_type,
  internal_id,
  COUNT(*) as count,
  GROUP_CONCAT(external_id SEPARATOR ', ') as external_ids
FROM fms_entity_mappings
WHERE facility_id = '2d2c3b76-d46e-408e-84c7-e8f8996c4d4a'
  AND entity_type = 'unit'
GROUP BY facility_id, entity_type, internal_id
HAVING COUNT(*) > 1;

