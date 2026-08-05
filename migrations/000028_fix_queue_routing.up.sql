-- Map VIP rules to VIP queue
UPDATE rules SET queue_id = (SELECT id FROM queues WHERE name = 'VIP / White-Glove Support')
WHERE name ILIKE '%vip%' OR name ILIKE '%high value%';

-- Map ATO rules to ATO queue
UPDATE rules SET queue_id = (SELECT id FROM queues WHERE name = 'Account Takeover Suspects')
WHERE name ILIKE '%ato%' OR name ILIKE '%night%transfer%';
