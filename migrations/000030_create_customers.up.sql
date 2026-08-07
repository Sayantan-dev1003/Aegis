CREATE TABLE customers (
    account_id   TEXT PRIMARY KEY,
    full_name    TEXT,
    email        TEXT,
    kyc_status   TEXT CHECK (kyc_status IN ('verified','pending','mismatch')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data for ACCT_1001 to ACCT_1100 to cover the default pool (30) and beyond
INSERT INTO customers (account_id, full_name, email, kyc_status, created_at)
SELECT
  'ACCT_' || n,
  (ARRAY['Amit Verma','Priya Nair','Rohan Kulkarni','Ananya Deshmukh','Kavya Sundaram',
         'Vikram Mehta','Siddharth Verma','Aarav Sharma','Rajeshwar Iyer'])[1 + (n % 9)],
  'user' || n || '@example.com',
  (ARRAY['verified','verified','verified','pending','mismatch'])[1 + (n % 5)],
  NOW() - (random() * INTERVAL '5 years')
FROM generate_series(1001, 1100) AS n
ON CONFLICT (account_id) DO NOTHING;
