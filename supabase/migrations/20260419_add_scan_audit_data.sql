-- Add audit data columns to scan_results for complete request/response/decision tracking
-- Stores audit trail for all scan outcomes: found, not found, geo rejected, errors, timeouts

ALTER TABLE scan_results ADD COLUMN audit_request jsonb;
ALTER TABLE scan_results ADD COLUMN audit_response jsonb;
ALTER TABLE scan_results ADD COLUMN audit_decision jsonb;
ALTER TABLE scan_results ADD COLUMN audit_scanner_version text;

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_scan_results_audit_scanner_version ON scan_results(audit_scanner_version);
