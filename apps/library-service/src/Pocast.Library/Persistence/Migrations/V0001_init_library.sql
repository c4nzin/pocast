CREATE TABLE follows (
    user_id     uuid        NOT NULL,
    podcast_id  uuid        NOT NULL,
    followed_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, podcast_id)
);

CREATE INDEX follows_user_recent_idx ON follows (user_id, followed_at DESC, podcast_id DESC);

CREATE INDEX follows_podcast_idx ON follows (podcast_id);

CREATE TABLE playback_progress (
    user_id          uuid        NOT NULL,
    episode_id       uuid        NOT NULL,
    podcast_id       uuid        NOT NULL,
    position_seconds integer     NOT NULL CHECK (position_seconds >= 0),
    duration_seconds integer     NULL CHECK (duration_seconds > 0),
    completed        boolean     NOT NULL,
    played_at        timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL,
    PRIMARY KEY (user_id, episode_id)
);

CREATE INDEX playback_progress_in_progress_idx
    ON playback_progress (user_id, played_at DESC, episode_id DESC)
    WHERE NOT completed;
