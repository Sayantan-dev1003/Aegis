-- Revert VIP and ATO rules queue assignments
UPDATE rules SET queue_id = NULL
WHERE name ILIKE '%vip%' OR name ILIKE '%high value%' OR name ILIKE '%ato%' OR name ILIKE '%night%transfer%';
