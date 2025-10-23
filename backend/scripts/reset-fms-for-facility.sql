-- Script to reset FMS sync state for a facility
-- Replace 'YOUR-FACILITY-ID-HERE' with your actual facility ID

SET @facility_id = '2d2c3b76-d46e-408e-84c7-e8f8996c4d4a';

-- 1. Delete all FMS entity mappings for this facility
DELETE FROM fms_entity_mappings WHERE facility_id = @facility_id;

-- 2. Delete all FMS changes for this facility's sync logs
DELETE fc FROM fms_changes fc
INNER JOIN fms_sync_logs fsl ON fc.sync_log_id = fsl.id
WHERE fsl.facility_id = @facility_id;

-- 3. Delete all FMS sync logs for this facility
DELETE FROM fms_sync_logs WHERE facility_id = @facility_id;

-- 4. Delete all units for this facility that were created by FMS (have fms_synced metadata)
DELETE FROM unit_tenant_assignments WHERE unit_id IN (
  SELECT id FROM units WHERE facility_id = @facility_id AND metadata LIKE '%fms_synced%'
);

DELETE FROM units WHERE facility_id = @facility_id AND metadata LIKE '%fms_synced%';

-- 5. Delete all tenant users for this facility
DELETE FROM user_facility_associations WHERE facility_id = @facility_id AND user_id IN (
  SELECT id FROM users WHERE role = 'tenant'
);

-- Note: We're NOT deleting the users themselves in case they have other facility associations
-- If you want to delete them completely, uncomment this:
-- DELETE FROM users WHERE role = 'tenant' AND id NOT IN (
--   SELECT DISTINCT user_id FROM user_facility_associations
-- );

SELECT 'FMS state reset complete for facility' AS status, @facility_id AS facility_id;

