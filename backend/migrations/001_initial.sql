-- Version 001: transactional schema, frozen from the initial SQLAlchemy model.

CREATE TABLE cleanup_jobs (
	path VARCHAR(300) NOT NULL,
	not_before DATETIME NOT NULL,
	PRIMARY KEY (path)
);

CREATE TABLE index_events (
	id INTEGER NOT NULL,
	pet_id VARCHAR(64) NOT NULL,
	profile_version INTEGER NOT NULL,
	event_type VARCHAR(20) NOT NULL,
	status VARCHAR(20) NOT NULL,
	attempts INTEGER NOT NULL,
	error VARCHAR(500) NOT NULL,
	next_attempt_at DATETIME,
	created_at DATETIME NOT NULL,
	processed_at DATETIME,
	PRIMARY KEY (id),
	UNIQUE (pet_id, profile_version, event_type)
);

CREATE INDEX ix_index_events_pet_id ON index_events (pet_id);

CREATE INDEX ix_index_events_status ON index_events (status);

CREATE TABLE organizations (
	id VARCHAR(64) NOT NULL,
	name VARCHAR(120) NOT NULL,
	description TEXT NOT NULL,
	locality VARCHAR(80) NOT NULL,
	department VARCHAR(80) NOT NULL,
	active BOOLEAN NOT NULL,
	is_demo BOOLEAN NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE rate_limits (
	key_hash VARCHAR(64) NOT NULL,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	PRIMARY KEY (key_hash, window_start)
);

CREATE INDEX ix_rate_limits_expires_at ON rate_limits (expires_at);

CREATE TABLE users (
	id VARCHAR(64) NOT NULL,
	email VARCHAR(254) NOT NULL,
	name VARCHAR(80) NOT NULL,
	password_hash TEXT NOT NULL,
	role VARCHAR(20) NOT NULL,
	active BOOLEAN NOT NULL,
	is_demo BOOLEAN NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT user_role CHECK (role IN ('adopter','responsible','admin'))
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE adopter_profiles (
	user_id VARCHAR(64) NOT NULL,
	data JSON NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
	id INTEGER NOT NULL,
	actor_id VARCHAR(64),
	action VARCHAR(80) NOT NULL,
	resource_id VARCHAR(100) NOT NULL,
	detail JSON NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);

CREATE TABLE memberships (
	user_id VARCHAR(64) NOT NULL,
	organization_id VARCHAR(64) NOT NULL,
	PRIMARY KEY (user_id, organization_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE password_resets (
	token_hash VARCHAR(64) NOT NULL,
	user_id VARCHAR(64) NOT NULL,
	expires_at DATETIME NOT NULL,
	used_at DATETIME,
	PRIMARY KEY (token_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_password_resets_user_id ON password_resets (user_id);

CREATE TABLE pets (
	id VARCHAR(64) NOT NULL,
	organization_id VARCHAR(64) NOT NULL,
	created_by_id VARCHAR(64) NOT NULL,
	name VARCHAR(80) NOT NULL,
	species VARCHAR(40) NOT NULL,
	location VARCHAR(80) NOT NULL,
	department VARCHAR(80) NOT NULL,
	months INTEGER NOT NULL,
	size VARCHAR(30) NOT NULL,
	sex VARCHAR(20) NOT NULL,
	energy INTEGER,
	data JSON NOT NULL,
	publication_status VARCHAR(20) NOT NULL,
	adoption_status VARCHAR(20) NOT NULL,
	profile_version INTEGER NOT NULL,
	is_demo BOOLEAN NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT publication_status CHECK (publication_status IN ('draft','pending','published','rejected','archived')),
	CONSTRAINT adoption_status CHECK (adoption_status IN ('available','under_review','reserved','adopted','withdrawn')),
	CONSTRAINT pet_months CHECK (months >= 0),
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE RESTRICT,
	FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_pets_adoption_status ON pets (adoption_status);

CREATE INDEX ix_pets_department ON pets (department);

CREATE INDEX ix_pets_location ON pets (location);

CREATE INDEX ix_pets_name ON pets (name);

CREATE INDEX ix_pets_organization_id ON pets (organization_id);

CREATE INDEX ix_pets_publication_status ON pets (publication_status);

CREATE INDEX ix_pets_species ON pets (species);

CREATE TABLE sessions (
	token_hash VARCHAR(64) NOT NULL,
	user_id VARCHAR(64),
	csrf_token VARCHAR(80) NOT NULL,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (token_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_sessions_expires_at ON sessions (expires_at);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE adoption_applications (
	id VARCHAR(64) NOT NULL,
	user_id VARCHAR(64) NOT NULL,
	pet_id VARCHAR(64) NOT NULL,
	status VARCHAR(30) NOT NULL,
	data JSON NOT NULL,
	is_demo BOOLEAN NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT application_user_pet UNIQUE (user_id, pet_id),
	CONSTRAINT application_status CHECK (status IN ('received','under_review','information_requested','meeting_scheduled','approved','rejected','closed','completed')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT,
	FOREIGN KEY(pet_id) REFERENCES pets (id) ON DELETE RESTRICT
);

CREATE INDEX ix_adoption_applications_pet_id ON adoption_applications (pet_id);

CREATE INDEX ix_adoption_applications_user_id ON adoption_applications (user_id);

CREATE TABLE compatibilities (
	id INTEGER NOT NULL,
	pet_id VARCHAR(64) NOT NULL,
	category VARCHAR(60) NOT NULL,
	status VARCHAR(30) NOT NULL,
	observation TEXT NOT NULL,
	responsible VARCHAR(120) NOT NULL,
	confidence FLOAT,
	evaluated_at DATETIME,
	context TEXT NOT NULL,
	recommendations TEXT NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (pet_id, category),
	CONSTRAINT compatibility_status CHECK (status IN ('compatible','incompatible','conditional','unknown','not_applicable')),
	FOREIGN KEY(pet_id) REFERENCES pets (id) ON DELETE CASCADE
);

CREATE INDEX ix_compatibilities_pet_id ON compatibilities (pet_id);

CREATE TABLE favorites (
	user_id VARCHAR(64) NOT NULL,
	pet_id VARCHAR(64) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (user_id, pet_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(pet_id) REFERENCES pets (id) ON DELETE CASCADE
);

CREATE TABLE photos (
	id VARCHAR(64) NOT NULL,
	pet_id VARCHAR(64) NOT NULL,
	variants JSON NOT NULL,
	alt VARCHAR(500) NOT NULL,
	position INTEGER NOT NULL,
	size_bytes INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(pet_id) REFERENCES pets (id) ON DELETE CASCADE
);

CREATE INDEX ix_photos_pet_id ON photos (pet_id);

CREATE TABLE application_history (
	id INTEGER NOT NULL,
	application_id VARCHAR(64) NOT NULL,
	actor_id VARCHAR(64) NOT NULL,
	status VARCHAR(30) NOT NULL,
	note TEXT NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(application_id) REFERENCES adoption_applications (id) ON DELETE CASCADE,
	FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_application_history_application_id ON application_history (application_id);
