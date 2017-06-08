DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS cs CASCADE;
DROP TABLE IF EXISTS rcs CASCADE;
DROP TABLE IF EXISTS active_rcs CASCADE;
DROP TABLE IF EXISTS bin_set CASCADE;
DROP TABLE IF EXISTS bin CASCADE;
DROP TABLE IF EXISTS bin_stats CASCADE;
DROP TABLE IF EXISTS poll CASCADE;
DROP TABLE IF EXISTS pov CASCADE;
DROP TABLE IF EXISTS pov_submission CASCADE;
DROP TABLE IF EXISTS active_pov CASCADE;
DROP TABLE IF EXISTS ids CASCADE;
DROP TABLE IF EXISTS ids_submission CASCADE;
DROP TABLE IF EXISTS active_ids CASCADE;
DROP TABLE IF EXISTS reference_patch CASCADE;
DROP TABLE IF EXISTS poll_scored_result CASCADE;
DROP TABLE IF EXISTS poll_replay CASCADE;
DROP TABLE IF EXISTS poll_reference_replay CASCADE;
DROP TABLE IF EXISTS pov_scored_result CASCADE;
DROP TABLE IF EXISTS pov_replay CASCADE;
DROP TABLE IF EXISTS pov_reference_replay CASCADE;
DROP TABLE IF EXISTS execution CASCADE;
DROP TABLE IF EXISTS execution_replay CASCADE;
DROP TABLE IF EXISTS execution_analysis CASCADE;
DROP TABLE IF EXISTS execution_analysis_result CASCADE;
DROP TABLE IF EXISTS reference_patch_replay CASCADE;
DROP TABLE IF EXISTS cs_added CASCADE;
DROP TABLE IF EXISTS cs_removed CASCADE;
DROP TABLE IF EXISTS cs_score CASCADE;
DROP TABLE IF EXISTS rank CASCADE;
DROP TABLE IF EXISTS story CASCADE;
DROP TABLE IF EXISTS story_history CASCADE;
DROP TABLE IF EXISTS story_comment CASCADE;
DROP TABLE IF EXISTS story_comment_history CASCADE;
DROP TABLE IF EXISTS auto_story_unique_name CASCADE;
DROP TABLE IF EXISTS round_complete CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS autoanalysis_round_complete CASCADE;

CREATE TABLE teams (id SERIAL PRIMARY KEY, name VARCHAR(64));
CREATE TABLE bin_set (id SERIAL PRIMARY KEY, hash VARCHAR(64));
CREATE TABLE bin (id serial PRIMARY KEY, bsid INTEGER REFERENCES bin_set(id), idx INTEGER, hash VARCHAR(64));
CREATE TABLE bin_stats (binid INTEGER REFERENCES bin(id), bin_hash VARCHAR(64), entropy real, byte_histogram text, sections text, opcode_histogram text, file_size integer, functions text, blocks text);
CREATE TABLE cs (id SERIAL PRIMARY KEY, name VARCHAR(32), name_hash VARCHAR(32), bsid INTEGER REFERENCES bin_set(id), loc integer, cwe text[], shortname text, description text, readme text, tag_list text[]);
CREATE TABLE rcs (id SERIAL PRIMARY KEY, team INTEGER REFERENCES teams(id), csid INTEGER REFERENCES cs(id), round INTEGER,
                  bsid INTEGER REFERENCES bin_set(id));
CREATE TABLE active_rcs (round INTEGER, team INTEGER REFERENCES teams(id), csid INTEGER REFERENCES cs(id),
                         bsid INTEGER REFERENCES bin_set(id), pending BOOLEAN, pending_reason VARCHAR(8));
CREATE TABLE poll (id SERIAL PRIMARY KEY, csid INTEGER REFERENCES cs(id), hash VARCHAR(64), seed VARCHAR(100), scheduled_time REAL);
CREATE TABLE pov (id SERIAL PRIMARY KEY, team INTEGER REFERENCES teams(id), csid INTEGER REFERENCES cs(id), hash VARCHAR(64));
CREATE TABLE pov_submission (id SERIAL PRIMARY KEY, pov INTEGER REFERENCES pov(id), round INTEGER,
                             target INTEGER REFERENCES teams(id), throw_count INTEGER);
CREATE TABLE active_pov (round INTEGER, povsub INTEGER REFERENCES pov_submission(id));
CREATE TABLE ids (id SERIAL PRIMARY KEY, csid INTEGER REFERENCES cs(id), hash VARCHAR(64));
CREATE TABLE ids_submission (id SERIAL PRIMARY KEY, ids INTEGER REFERENCES ids(id), team INTEGER REFERENCES teams(id), round INTEGER);
CREATE TABLE active_ids (round INTEGER, idssub INTEGER REFERENCES ids_submission(id));
CREATE TABLE reference_patch (id SERIAL PRIMARY KEY, csid INTEGER REFERENCES cs(id), bsid INTEGER REFERENCES bin_set(id),
                              full_patch BOOLEAN);
CREATE TABLE execution (id SERIAL PRIMARY KEY, bsid INTEGER REFERENCES bin_set(id), mem INTEGER, cpu BIGINT);
CREATE TABLE execution_replay (execution INTEGER REFERENCES execution(id), idx INTEGER, hash VARCHAR(64));
CREATE TABLE execution_analysis (id SERIAL PRIMARY KEY, execution INTEGER REFERENCES execution(id), config TEXT);
CREATE TABLE execution_analysis_result (analysis INTEGER REFERENCES execution_analysis(id), idx INTEGER, hash VARCHAR(64));
CREATE TABLE poll_scored_result (bsid INTEGER REFERENCES bin_set(id), team INTEGER REFERENCES teams(id), poll INTEGER REFERENCES poll(id),
                                 round INTEGER, pass BOOLEAN, start_time REAL, duration REAL);
CREATE TABLE poll_replay (bsid INTEGER REFERENCES bin_set(id), idsid INTEGER REFERENCES ids(id), poll INTEGER REFERENCES poll(id),
                          pass BOOLEAN, execution INTEGER REFERENCES execution(id));
CREATE TABLE pov_scored_result (povsub INTEGER REFERENCES pov_submission(id), target INTEGER REFERENCES bin_set(id),
                                round INTEGER, throw INTEGER, pov_type INTEGER, vulnerable BOOLEAN, start_time REAL, duration REAL,
                                seed VARCHAR(100));
CREATE TABLE pov_replay (pov INTEGER REFERENCES pov(id), target INTEGER REFERENCES bin_set(id), idsid INTEGER REFERENCES ids(id), throw INTEGER,
                         pov_type INTEGER, vulnerable BOOLEAN, execution INTEGER REFERENCES execution(id));
CREATE TABLE cs_added (csaddedid SERIAL, csid INTEGER REFERENCES cs(id), round INTEGER);
CREATE TABLE cs_removed (csid INTEGER REFERENCES cs(id), round INTEGER);
CREATE TABLE cs_score (team INTEGER REFERENCES teams(id), csid INTEGER REFERENCES cs(id), round INTEGER, total REAL,
                       avail_score REAL, func_score REAL, timeout REAL, connect_fail REAL, perf_score REAL, mem REAL, cpu REAL,
                       file_size REAL, security_score REAL, eval_score REAL);
CREATE TABLE rank (round INTEGER, rank INTEGER, team INTEGER REFERENCES teams(id), score INTEGER);
CREATE TABLE story (id SERIAL PRIMARY KEY, title TEXT, description TEXT, creator VARCHAR(64), owner VARCHAR(64), visualizer VARCHAR(64), priority INTEGER, state INTEGER,
                    story_order INTEGER, create_time TIMESTAMP, edit_time TIMESTAMP);
CREATE TABLE story_history (id SERIAL PRIMARY KEY, story INTEGER REFERENCES story(id), title TEXT, owner TEXT, visualizer TEXT, description TEXT,
                            edit_time TIMESTAMP);
CREATE TABLE story_comment (id SERIAL PRIMARY KEY, story INTEGER REFERENCES story(id), contents TEXT, owner VARCHAR(64),
                            create_time TIMESTAMP, edit_time TIMESTAMP);
CREATE TABLE story_comment_history (id SERIAL PRIMARY KEY, commentid INTEGER REFERENCES story_comment(id), contents TEXT,
                                    edit_time TIMESTAMP);
CREATE TABLE auto_story_unique_name (name VARCHAR(100));
CREATE TABLE round_complete (round INTEGER);
CREATE TABLE rounds (round INTEGER, starttime TIMESTAMP, endtime TIMESTAMP);
CREATE TABLE autoanalysis_round_complete (round INTEGER, name VARCHAR(64));

CREATE UNIQUE INDEX idx_team_names ON teams (name);
CREATE UNIQUE INDEX idx_bin_set_hash ON bin_set (hash);
CREATE INDEX idx_bin ON bin (bsid);
CREATE UNIQUE INDEX idx_bin_parts ON bin (bsid, idx);
CREATE UNIQUE INDEX idx_cs_names ON cs (name);
CREATE INDEX idx_rcs ON rcs (team, csid, round);
CREATE INDEX idx_active_rcs ON active_rcs (round);
CREATE UNIQUE INDEX idx_active_rcs_bins ON active_rcs (round, team, csid);
CREATE INDEX idx_polls ON poll (csid);
CREATE UNIQUE INDEX idx_poll_seed ON poll (seed);
CREATE INDEX idx_poll_hashes ON poll (csid, hash);
CREATE INDEX idx_povs ON pov (team, csid);
CREATE INDEX idx_pov_submission ON pov_submission (round);
CREATE INDEX idx_pov_targets ON pov_submission (round, target);
CREATE INDEX idx_active_pov ON active_pov (round);
CREATE INDEX idx_ref_patches ON reference_patch (csid);
CREATE UNIQUE INDEX idx_ref_patch_bin ON reference_patch (csid, bsid);
CREATE INDEX idx_exec_replays ON execution_replay (execution);
CREATE UNIQUE INDEX idx_exec_replay_set ON execution_replay (execution, idx);
CREATE UNIQUE INDEX idx_exec_analysis_configs ON execution_analysis (execution, config);
CREATE INDEX idx_exec_analysis_results ON execution_analysis_result (analysis);
CREATE UNIQUE INDEX idx_exec_analysis_result_set ON execution_analysis_result (analysis, idx);
CREATE INDEX idx_poll_scored_results ON poll_scored_result (bsid);
CREATE INDEX idx_poll_replays ON poll_replay (bsid, poll);
CREATE INDEX idx_pov_scored_results ON pov_scored_result (povsub, target);
CREATE INDEX idx_pov_replays ON pov_replay (pov, target);
CREATE UNIQUE INDEX idx_rounds_completed ON round_complete (round);
CREATE INDEX idx_cs_added_round ON cs_added (round);
CREATE UNIQUE INDEX idx_cs_added ON cs_added (csid, round);
CREATE INDEX idx_cs_removed_round ON cs_removed (round);
CREATE UNIQUE INDEX idx_cs_removed ON cs_removed (csid, round);
CREATE UNIQUE INDEX idx_cs_score ON cs_score (team, csid, round);
CREATE UNIQUE INDEX idx_autoanalysis_round_complete ON autoanalysis_round_complete (round, name);
CREATE INDEX idx_comment ON story_comment (story);
CREATE INDEX idx_story_history ON story_history (story);
CREATE INDEX idx_story_comment_history ON story_comment_history (commentid);
CREATE UNIQUE INDEX idx_auto_story_unique_name ON auto_story_unique_name (name);

CREATE OR REPLACE FUNCTION swap_story(integer,integer) RETURNS void AS '
UPDATE story dst
SET story_order = src.story_order
FROM story src
WHERE dst.id IN($1,$2)
AND src.id IN($1,$2)
AND dst.id <> src.id
' LANGUAGE SQL;

CREATE OR REPLACE FUNCTION story_up(integer) RETURNS void AS '
SELECT swap_story($1,
  (SELECT COALESCE(id,$1) FROM story
    WHERE priority = (SELECT priority FROM story WHERE id = $1)
    AND state = (SELECT state FROM story WHERE id = $1)
    AND story_order > (SELECT story_order FROM story WHERE id = $1) ORDER BY story_order ASC LIMIT 1
  )
);' LANGUAGE SQL;


CREATE OR REPLACE FUNCTION story_down(integer) RETURNS void AS '
SELECT swap_story( (SELECT COALESCE(id,$1) FROM story
    WHERE priority = (SELECT priority FROM story WHERE id = $1)
    AND state = (SELECT state FROM story WHERE id = $1)
    AND story_order < (SELECT story_order FROM story WHERE id = $1) ORDER BY story_order DESC LIMIT 1
  ), $1
);' LANGUAGE SQL;
