-- Seed default queues
INSERT INTO queues (name, description, status, sla_target_minutes)
SELECT 'ML Borderline Review', 'Cases flagged by ML model requiring human review', 'active', 60
WHERE NOT EXISTS (SELECT 1 FROM queues WHERE name = 'ML Borderline Review');

INSERT INTO queues (name, description, status, sla_target_minutes)
SELECT 'High Value Exceptions', 'Transactions exceeding risk threshold or high monetary value', 'active', 30
WHERE NOT EXISTS (SELECT 1 FROM queues WHERE name = 'High Value Exceptions');

INSERT INTO queues (name, description, status, sla_target_minutes)
SELECT 'ATO Suspects', 'Account takeover anomalies and credential stuffing patterns', 'active', 45
WHERE NOT EXISTS (SELECT 1 FROM queues WHERE name = 'ATO Suspects');

-- Seed analyst accounts with password_hash of bcrypt("password123")
INSERT INTO analysts (email, password_hash, full_name, role, queue_id, is_active) VALUES
('admin@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'System Admin', 'admin', NULL, true),
('viewer@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'Junior Analyst', 'viewer', NULL, true),
('reviewer@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'Ananya Deshmukh', 'reviewer', (SELECT id FROM queues WHERE name = 'ML Borderline Review' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET 
    queue_id = EXCLUDED.queue_id,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- Ensure any existing escalated transactions without a queue are assigned to 'ML Borderline Review'
UPDATE transactions
SET queue_id = (SELECT id FROM queues WHERE name = 'ML Borderline Review' LIMIT 1)
WHERE status = 'escalated' AND queue_id IS NULL;
