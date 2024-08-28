CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS whisperingrealm (
    key varchar(128) PRIMARY KEY,
    doc text NOT NULL,
    embedding vector(768) NOT NULL
);
