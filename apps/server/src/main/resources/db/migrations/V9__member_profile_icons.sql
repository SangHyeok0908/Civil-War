CREATE TABLE member_profile_snapshots (
    member_id varchar(255) PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    riot_id varchar(100) NOT NULL,
    profile_icon_id integer CHECK (profile_icon_id >= 0),
    observed_at timestamptz,
    next_attempt_at timestamptz NOT NULL
);
