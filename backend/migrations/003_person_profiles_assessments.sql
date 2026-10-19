CREATE TABLE person_profiles (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data JSON NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE TABLE application_assessments (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES adoption_applications(id) ON DELETE CASCADE,
    evaluator_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    pet_version INTEGER NOT NULL,
    profile_hash VARCHAR(64) NOT NULL,
    result JSON NOT NULL,
    created_at DATETIME NOT NULL
);
CREATE INDEX ix_assessments_application_created ON application_assessments(application_id, created_at);
