CREATE TABLE shows (
    id                   uuid         PRIMARY KEY DEFAULT uuidv7(),
    owner_id             uuid         NOT NULL,
    title                varchar(255) NOT NULL,
    description          text         NOT NULL,
    author               varchar(255) NULL,
    language             varchar(35)  NOT NULL,
    category_slug        varchar(100) NOT NULL,
    category_name        varchar(100) NOT NULL,
    category_parent_name varchar(100) NULL,
    explicit             boolean      NOT NULL DEFAULT false,
    image_url            text         NULL,
    status               varchar(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    published_at         timestamptz  NULL,
    created_at           timestamptz  NOT NULL,
    updated_at           timestamptz  NOT NULL
);

CREATE INDEX shows_owner_recent_idx ON shows (owner_id, created_at DESC);

CREATE TABLE episodes (
    id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
    show_id             uuid         NOT NULL REFERENCES shows (id) ON DELETE CASCADE,
    title               varchar(255) NOT NULL,
    description         text         NOT NULL,
    episode_type        varchar(16)  NOT NULL CHECK (episode_type IN ('FULL', 'TRAILER', 'BONUS')),
    season_number       integer      NULL CHECK (season_number > 0),
    episode_number      integer      NULL CHECK (episode_number > 0),
    explicit            boolean      NOT NULL DEFAULT false,
    status              varchar(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    pending_media_key   text         NULL,
    pending_media_type  varchar(64)  NULL,
    media_key           text         NULL,
    media_content_type  varchar(64)  NULL,
    media_size_bytes    bigint       NULL CHECK (media_size_bytes > 0),
    duration_seconds    integer      NULL CHECK (duration_seconds > 0),
    published_at        timestamptz  NULL,
    created_at          timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL,
    CHECK (status = 'DRAFT' OR media_key IS NOT NULL)
);

CREATE INDEX episodes_show_recent_idx ON episodes (show_id, created_at DESC);

CREATE INDEX episodes_show_published_idx ON episodes (show_id, published_at DESC) WHERE status = 'PUBLISHED';
