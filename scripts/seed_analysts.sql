-- Seed analyst accounts with password_hash of bcrypt("password123")
INSERT INTO analysts (email, password_hash, full_name, role, is_active) VALUES
('admin@aegis.com', '$2a$10$w827eIqgD4M0U.J97f0Pne/PjUoW.eU.z8h2/HskfLqOqB3y5J5iK', 'System Admin', 'admin', true),
('reviewer@aegis.com', '$2a$10$w827eIqgD4M0U.J97f0Pne/PjUoW.eU.z8h2/HskfLqOqB3y5J5iK', 'Lead Reviewer', 'reviewer', true),
('viewer@aegis.com', '$2a$10$w827eIqgD4M0U.J97f0Pne/PjUoW.eU.z8h2/HskfLqOqB3y5J5iK', 'Junior Analyst', 'viewer', true)
ON CONFLICT (email) DO NOTHING;
