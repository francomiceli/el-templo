ALTER TABLE session_prescriptions ADD COLUMN exercise_type VARCHAR(10) NOT NULL DEFAULT 'main';
-- drizzle-breakpoint
CREATE INDEX session_prescriptions_type_idx ON session_prescriptions(exercise_type);
