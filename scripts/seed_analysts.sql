-- Seed analyst accounts with password_hash of bcrypt("password123")
INSERT INTO analysts (email, password_hash, full_name, role, is_active) VALUES
('admin@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'System Admin', 'admin', true),
('reviewer@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'Lead Reviewer', 'reviewer', true),
('viewer@aegis.com', '$2a$10$29BidhTWWtw.IIl0BWHYuePtEp324PxlleeDFdPRSXPywxfnx4Qii', 'Junior Analyst', 'viewer', true)
ON CONFLICT (email) DO NOTHING;
