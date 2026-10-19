CREATE TABLE maintenance_jobs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    kind VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    detail JSON NOT NULL,
    error VARCHAR(300) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
CREATE INDEX ix_maintenance_jobs_status ON maintenance_jobs(status);
CREATE TABLE rule_versions (
    version VARCHAR(60) NOT NULL PRIMARY KEY,
    parameters JSON NOT NULL,
    created_at DATETIME NOT NULL
);
