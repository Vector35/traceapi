var express = require('express');
var redirect = require('express-redirect');
var morgan = require('morgan');
var pg = require('pg');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var fs = require('fs');
var handlebars = require('handlebars');
var marked = require('marked');

var app = express();
redirect(app);

var db = process.argv[3] || "trace-api";

var router = express.Router();
if (process.env.DEBUG) {
	app.use(morgan('combined'));
}

var storePath = "./store"
var uploadPath = "./uploads"

var normalWorkQueue = [];
var priorityWorkQueue = [];
var interactiveWorkQueue = [];
var workers = [];
var waitingWorkers = [];

var pendingAnalysis = {};
var pendingPolls = {};
var pendingStats = {};
var pendingPovs = {};

var eventDataCache = [];

var priorityOnly = true;

if (!fs.existsSync(storePath)) {
	fs.mkdirSync(storePath);
}
if (!fs.existsSync(uploadPath)) {
	fs.mkdirSync(uploadPath);
}

function add_partial_template(name, path) {
	return handlebars.registerPartial(name, fs.readFileSync(path, 'utf8'));
}

function compile_template(name) {
	return handlebars.compile(fs.readFileSync(name, 'utf8'));
}

add_partial_template('head', 'html/head.html');
add_partial_template('includes', 'html/includes.html');
add_partial_template('tail', 'html/tail.html');

var statusTemplate = compile_template('html/status.html');
var roundTemplate = compile_template('html/rounds.html');
var binaryTemplate = compile_template('html/binary.html');
var idsTemplate = compile_template('html/ids.html');
var binaryAndIdsTemplate = compile_template('html/binary_and_ids.html');
var povTemplate = compile_template('html/pov.html');
var pollTemplate = compile_template('html/poll.html');
var csTemplate = compile_template('html/cs.html');
var teamTemplate = compile_template('html/team.html');
var storyHistoryTemplate = compile_template('html/story_history.html');
var storyCommentHistoryTemplate = compile_template('html/comment_history.html');

var markdownReference = marked(fs.readFileSync("markdownref.md", 'utf8'));
var markdownReferenceTemplate = compile_template('html/markdown.html');

app.use(bodyParser.json({limit: '700mb'}));

pg.on('error', function (err) {
	console.log('Database error! Will automatically reconnect.', err);
});

function db_request(f)
{
	return function(req, res, next) {
		var pgclient = new pg.Client();
		pg.connect(function(err, client, done) {
			if (err) {
				console.error(err);
				done(client);
				if (res !== null)
					res.status(500).json({'ok': false});
				return;
			}

			var obj = new function() {
				this.query = function(args) {
					var params = [].slice.call(arguments, 0, -1);
					var success = arguments[arguments.length - 1];
					params.push(function(err, result) {
						if (err) {
							console.error(err);
							done(client);
							if (res !== null)
								res.status(500).json({'ok': false});
							return;
						}

						try {
							success(result);
						} catch (e) {
							console.error(e.stack);
							obj.error(500);
							return;
						}
					});
					client.query.apply(client, params);
				}
				this.inTransaction = false;
				this.isDone = false;
				this.isValid = true;
				this.worker = null;
				this.transaction = function(f) {
					obj.inTransaction = true;
					obj.query('BEGIN TRANSACTION', function (result) { f(); });
				}
				this.commit = function(f) {
					if (obj.inTransaction) {
						obj.inTransaction = false;
						obj.query('COMMIT TRANSACTION', function (result) { f(); });
					} else {
						f();
					}
				}
				this.rollback = function(f) {
					if (obj.inTransaction) {
						obj.inTransaction = false;
						obj.query('ROLLBACK TRANSACTION', function (result) { f(); });
					} else {
						f();
					}
				}
				this.done = function() {
					obj.commit(function() {
						if (!obj.isDone) {
							done();
							obj.isDone = true;
						}
					});
				}
				this.reply = function(data) {
					obj.commit(function() {
						if (!obj.isDone) {
							done();
							obj.isDone = true;
						}
						if ((res !== null) && obj.isValid) {
							res.json(data);
							obj.isValid = false;
						}
					});
				}
				this.reply_data = function(data) {
					obj.commit(function() {
						if (!obj.isDone) {
							done();
							obj.isDone = true;
						}
						if ((res !== null) && obj.isValid) {
							res.send(data);
							obj.isValid = false;
						}
					});
				}
				this.error = function(code) {
					obj.rollback(function() {
						if (!obj.isDone) {
							done();
							obj.isDone = true;
						}
						if ((res !== null) && obj.isValid) {
							res.status(code).json({'ok': false});
							obj.isValid = false;
						}
					});
				}
				this.completeWork = function() {
					if (obj.worker != null) {
						obj.worker.pending = null;
						obj.worker.client = null;
						obj.worker = null;
					} else {
						console.log("Completing work for a client but the client doesn't have a pending request");
					}
				}
			};

			try {
				f(req, obj);
			} catch (e) {
				console.error(e.stack);
				obj.error(500);
			}
		});
	};
}

function early_db_request(f) {
	db_request(function (req, obj) { f(obj); })(null, null, null);
}

function populate_work_queue_pov_rcs(round, client, done) {
	client.query('SELECT pov.id, active_rcs.bsid, pov.hash FROM pov_submission INNER JOIN pov ON pov.id = pov_submission.pov INNER JOIN active_rcs ON pov.csid = active_rcs.csid AND pov_submission.round = active_rcs.round AND pov_submission.target = active_rcs.team LEFT JOIN pov_replay ON pov_replay.pov = pov.id AND pov_replay.target = active_rcs.bsid AND pov_replay.idsid IS NULL WHERE pov_replay.execution IS NULL AND (pov_submission.target IS NULL OR pov_submission.target = active_rcs.team) AND pov_submission.round=$1',
		[round],
		function (result) {
			for (var i = 0; i < result.rows.length; i++) {
				var pov = result.rows[i].id;
				var bsid = result.rows[i].bsid;
				var hash = result.rows[i].hash;

				var entry = {'work': {'type': 'pov', 'pov': pov, 'bsid': bsid, 'idsid': null, 'hash': hash},
					'client': null};
				normalWorkQueue.push(entry);
			}

			done();
		});
}

function populate_work_queue_for_round(round, client, done) {
	populate_work_queue_pov_rcs(round, client, function() {
		// Wake up workers to start processing the new work
		for (var i = 0; i < waitingWorkers.length; i++) {
			waitingWorkers[i].wake();
		}
		waitingWorkers = [];

		done();
	});
}

function wake_worker() {
	if (waitingWorkers.length > 0) {
		worker = waitingWorkers.shift();
		worker.wake();
	}
}

function upload(contents, done) {
	var hash = crypto.createHash('sha256');
	hash.update(contents);
	hash = hash.digest('hex');
	var path = storePath + "/" + hash
	fs.writeFile(path, contents, function (err) {
		done(err, hash);
	});
}

function uploadUserFile(contents, name, done) {
	var hash = crypto.createHash('sha256');
	hash.update(contents);
	hash = hash.digest('hex');
	var path = uploadPath + "/" + hash + "/" + name;
	if (!fs.existsSync(uploadPath + "/" + hash)) {
		fs.mkdirSync(uploadPath + "/" + hash);
	}
	fs.writeFile(path, contents, function (err) {
		done(err, hash);
	});
}

router.route(['/round/:round'])
.get(db_request(function(req, client) {
	client.query('SELECT round, extract(epoch from starttime) as starttime, extract(epoch from endtime) as endtime FROM rounds WHERE round=$1', [req.params.round], function(result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'round': row.round, 'start': row.starttime, 'end': row.endtime});
		});
		client.reply({'ok': true, 'rounds': data});
	});
}))
.post(db_request(function(req, client) {
	client.query('INSERT INTO rounds (round,starttime,endtime) VALUES ($1,to_timestamp($2),to_timestamp($3))', [req.params.round,req.body['start'],req.body['end']], function(result) {
		client.reply({'ok': true});
	});
}));

router.route('/team')
.get(db_request(function(req, client) {
	client.query('SELECT id, name FROM teams ORDER BY id ASC', function(result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'id': row.id, 'name': row.name});
		});
		client.reply({'ok': true, 'teams': data});
	});
}))
.post(db_request(function(req, client) {
	client.query('INSERT INTO teams (name) VALUES ($1) RETURNING id', [req.body['name']], function(result) {
		client.reply({'ok': true, 'id': result.rows[0].id});
	});
}));

router.route('/stats')
.post(db_request(function(req, client) {
	var bin_id = req.body['bin_id'];
	var bin_hash = req.body['bin_hash'];
	var entropy = req.body['entropy'];
	var byte_histogram = req.body['byte_histogram'];
	var sections = req.body['sections'];
	var opcode_histogram = req.body['opcode_histogram'];
	var file_size = req.body['file_size'];
	var functions= req.body['functions'];
	var blocks= req.body['blocks'];

	client.transaction(function() {
		client.query('SELECT binid FROM bin_stats WHERE binid=$1', [bin_id], function (result) {
			if (result.rows.length > 0) {
				if (result.rows[0].binid != bin_id) {
					// If adding stats for a binid that already exists, it must be the same binid
					client.error(409);
					return;
				}

				// Return existing contents if the same binid is submitted more than once
				client.reply({'ok': true, 'csid': result.rows[0].binid});
				return;
			}

			client.query('INSERT INTO bin_stats VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [bin_id, bin_hash, entropy, byte_histogram, sections, opcode_histogram, file_size, functions, blocks], function (result) {
				if (bin_id in pendingStats) {
					// There is a client waiting on the results of these stats, notify now
					pendingStats[bin_id]({'ok': true, 'binid': bin_id,
						'file': bin_hash,
						'entropy': entropy,
						'byte_histogram': byte_histogram,
						'sections': sections,
						'opcode_histogram': opcode_histogram,
						'file_size': file_size,
						'functions': functions,
						'blocks': blocks});
					delete pendingStats[bin_id];
				}

				client.reply({'ok': true, 'bin_id': bin_id});
			});
		});
	});
}));

router.route('/team/:id')
.get(db_request(function(req, client) {
	client.query('SELECT name FROM teams WHERE id=$1', [req.params.id], function(result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'name': result.rows[0].name});
	});
}));

router.route('/team/:id/score')
.get(db_request(function(req, client) {
	client.query('SELECT round, score, rank FROM rank WHERE team=$1 ORDER BY round ASC', [req.params.id], function(result) {
		scores = [];
		result.rows.forEach(function (row) {
			scores.push({'round': row.round, 'score': row.score, 'rank': row.rank});
		});
		client.reply({'ok': true, 'scores': scores});
	});
}));

router.route('/binset')
.post(db_request(function(req, client) {
	client.transaction(function() {
		var binaries = [];
		for (var i = 0; i < req.body['binaries'].length; i++) {
			binaries.push(new Buffer(req.body['binaries'][i], 'base64'));
		}

		if (binaries.length < 1) {
			client.error(400);
			return;
		}

		var hashes = '';
		for (var i = 0; i < binaries.length; i++) {
			var hash = crypto.createHash('sha256');
			hash.update(binaries[i]);
			hashes += hash.digest('hex');
		}

		var finalHash = crypto.createHash('sha256');
		finalHash.update(hashes);
		finalHash = finalHash.digest('hex');

		client.query('SELECT id FROM bin_set WHERE hash=$1', [finalHash], function (result) {
			if (result.rows.length > 0) {
				// Return existing binary if uploaded more than once
				var bsid = result.rows[0].id;
				client.reply({'ok': true, 'hash': finalHash, 'bsid': bsid});
			} else {
				client.query('INSERT INTO bin_set (hash) VALUES ($1) RETURNING id', [finalHash], function (result) {
					var bsid = result.rows[0].id;

					var uploadBinary = function(i) {
						if (i >= req.body['binaries'].length) {
							client.reply({'ok': true, 'hash': finalHash, 'bsid': bsid});
							return;
						}

						upload(binaries[i], function(err, hash) {
							if (err) {
								console.error(err);
								client.rollback();
								client.error(500);
								return;
							}

							client.query('INSERT INTO bin (bsid, idx, hash) VALUES ($1, $2, $3) RETURNING id', [bsid, i, hash],
								function (result) {
									var entry = {'work': {'type': 'stats', 'bin_id': result.rows[0].id, 'hash': hash},
										'client': null};
									priorityWorkQueue.push(entry);
									uploadBinary(i + 1);
								});
						});
					};

					uploadBinary(0);
				});
			}
		});
	});
}));

router.route('/binset/:id')
.get(db_request(function(req, client) {
	client.query('SELECT hash FROM bin_set WHERE id=$1', [req.params.id], function(result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var hash = result.rows[0].hash;
		client.query('SELECT id, hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [req.params.id], function (result) {
			var data = [];
			var id_list = [];
			result.rows.forEach(function(row) {
				data.push(row.hash);
				id_list.push(row.id);
			});
			client.reply({'ok': true, 'hash': hash, 'files': data, "binid": id_list});
		});
	});
}));

router.route('/binset/hash/:hash')
.get(db_request(function(req, client) {
	client.query('SELECT id FROM bin_set WHERE hash=$1', [req.params.hash], function(result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var bsid = result.rows[0].id;
		client.query('SELECT hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [bsid], function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push(row.hash);
			});
			client.reply({'ok': true, 'bsid': bsid, 'files': data});
		});
	});
}));

function send_binset_info(client, id, info) {
	client.query('SELECT bsid FROM cs WHERE id=$1', [info['csid']], function (result) {
		if (result.rows.length == 0) {
			client.error(500);
			return;
		}

		var ref_bsid = result.rows[0].bsid;

		client.query('SELECT bsid FROM reference_patch WHERE csid=$1', [info['csid']], function (result) {
			var ref_patches = [];
			result.rows.forEach(function (row) {
				ref_patches.push(row.bsid);
			});

			client.query('SELECT hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [id], function (files) {
				var data = [];
				files.rows.forEach(function(row) {
					data.push(row.hash);
				});
				info['ok'] = true;
				info['ref_bsid'] = ref_bsid;
				info['ref_patch'] = ref_patches;
				info['files'] = data;
				client.reply(info);
			});
		});
	});
}

router.route('/binset/:id/info')
.get(db_request(function(req, client) {
	client.query('SELECT id, name, shortname FROM cs WHERE bsid=$1', [req.params.id], function (result) {
		if (result.rows.length != 0) {
			send_binset_info(client, req.params.id, {'type': 'ref', 'csid': result.rows[0].id, 'cs_name': result.rows[0].name, 'cs_display_name': result.rows[0].shortname});
			return;
		}

		client.query('SELECT reference_patch.id as patchid, reference_patch.full_patch, reference_patch.csid, cs.name, cs.shortname FROM reference_patch INNER JOIN cs ON reference_patch.csid = cs.id WHERE reference_patch.bsid=$1', [req.params.id],
			function (result) {
				if (result.rows.length != 0) {
					send_binset_info(client, req.params.id, {'type': 'refpatch', 'csid': result.rows[0].csid, 'cs_name': result.rows[0].name, 'cs_display_name': result.rows[0].shortname, 'patchid': result.rows[0].patchid, 'full': result.rows[0].full_patch});
					return;
				}

				client.query('SELECT rcs.id AS rcsid, rcs.team, rcs.csid, rcs.round, cs.name, cs.shortname, teams.name AS teamname FROM rcs INNER JOIN cs ON rcs.csid = cs.id INNER JOIN teams ON rcs.team = teams.id WHERE rcs.bsid=$1 ORDER BY rcs.round ASC', [req.params.id],
					function (result) {
						if (result.rows.length == 0) {
							client.error(404);
							return;
						}

						var subs = [];
						result.rows.forEach(function (row) {
							subs.push({'team': row.team, 'name': row.teamname, 'round': row.round, 'rcsid': row.rcsid});
						});

						send_binset_info(client, req.params.id, {'type': 'rcs', 'csid': result.rows[0].csid, 'cs_name': result.rows[0].name, 'cs_display_name': result.rows[0].shortname, 'submissions': subs});
					});
			});
	});
}));

router.route('/binset/:id/score')
.get(db_request(function(req, client) {
	client.query('SELECT cs_score.round, cs_score.csid, AVG(cs_score.total) AS total, AVG(cs_score.avail_score) AS avail_score, AVG(cs_score.func_score) AS func_score, AVG(cs_score.timeout) AS timeout, AVG(cs_score.connect_fail) AS connect_fail, AVG(cs_score.perf_score) AS perf_score, AVG(cs_score.mem) AS mem, AVG(cs_score.cpu) AS cpu, AVG(cs_score.file_size) AS file_size, AVG(cs_score.security_score) AS security_score, AVG(cs_score.eval_score) AS eval_score FROM cs_score INNER JOIN active_rcs ON active_rcs.round = cs_score.round AND active_rcs.csid = cs_score.csid AND active_rcs.team = cs_score.team WHERE active_rcs.bsid=$1 GROUP BY cs_score.round, cs_score.csid ORDER BY cs_score.round ASC', [req.params.id],
		function (result) {
			rounds = [];
			result.rows.forEach(function (row) {
				rounds.push({'round': row.round, 'csid': row.csid, 'total': row.total, 'avail_score': row.avail_score,
					'func_score': row.func_score, 'timeout': row.timeout, 'connect_fail': row.connect_fail,
					'perf_score': row.perf_score, 'mem': row.mem, 'cpu': row.cpu, 'file_size': row.file_size,
					'security_score': row.security_score, 'eval_score': row.eval_score});
			});
			client.reply({'ok': true, 'rounds': rounds});
		});
}));

router.route('/cs')
.get(db_request(function(req, client) {
	client.query('SELECT id, name FROM cs', function(result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'csid': row.id, 'name': row.name});
		});
		client.reply({'ok': true, 'list': data});
	});
}))
.post(db_request(function(req, client) {
	var name = req.body['name'];
	var name_hash = req.body['name_hash'];
	var bsid = req.body['bsid'];
	var loc = req.body['loc'];
	var cwe = req.body['cwe'];
	var shortname = req.body['shortname'];
	var readme = req.body['readme'];
	var description = req.body['description'];
	var tags = req.body['tags'];

	client.transaction(function() {
		client.query('SELECT id, bsid FROM cs WHERE name=$1', [name], function (result) {
			if (result.rows.length > 0) {
				if (result.rows[0].bsid != bsid) {
					// If adding a CB that already exists, it must be the same CB
					client.error(409);
					return;
				}

				// Return existing contents if the same CB is submitted more than once
				client.reply({'ok': true, 'csid': result.rows[0].id});
				return;
			}

			client.query('INSERT INTO cs (name, name_hash, bsid, loc, cwe, shortname, description, readme, tag_list) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [name, name_hash, bsid, loc, cwe, shortname, description, readme, tags], function (result) {
				client.reply({'ok': true, 'csid': result.rows[0].id});
			});
		});
	});
}));

router.route('/cs/:id')
.get(db_request(function(req, client) {
	client.query('SELECT cs.name as name, cs.name_hash as name_hash, cs.bsid as bsid, cs_added.csaddedid as position, cs.loc as loc, cs.shortname as shortname, cs.description as description, cs.readme as readme, cs.cwe as cwe, cs.tag_list as tag_list FROM cs, cs_added WHERE cs.id=$1 and cs_added.csid=cs.id;', [req.params.id], function(result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var name = result.rows[0].name;
		var name_hash = result.rows[0].name_hash;
		var bsid = result.rows[0].bsid;
		var loc = result.rows[0].loc;
		var shortname = result.rows[0].shortname;
		var readme = result.rows[0].readme;
		var description = result.rows[0].description;
		var cwe = result.rows[0].cwe;
		var position = result.rows[0].position;
		var tags = result.rows[0].tag_list;

		client.query('SELECT hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [bsid], function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push(row.hash);
			});

			client.reply({'ok': true, 'name': name, 'name_hash': name_hash, 'bsid': bsid, 'files': data, 'loc': loc, 'shortname': shortname, 'cwe': cwe, 'description': description, 'readme': readme, 'position': position, 'tags': tags});
		});
	});
}))
.post(db_request(function(req, client) {
	var bsid = req.body['bsid'];
	client.transaction(function() {
		client.query('UPDATE cs SET bsid=$1 WHERE id=$2', [bsid, req.params.id], function (result) {
			client.reply({'ok': true});
		});
	});
}));

router.route('/cs/:id/refpatch')
.get(db_request(function(req, client) {
	client.query('SELECT bsid FROM reference_patch WHERE csid=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var data = [];
		result.rows.forEach(function(row) {
			data.push(row.bsid);
		});
		client.reply({'ok': true, 'bsid': data});
	});
}));

router.route('/cs/:id/rcs')
.get(db_request(function(req, client) {
	client.query('SELECT id, team, round, bsid FROM rcs WHERE csid=$1 ORDER BY round ASC', [req.params.id], function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'rcsid': row.id, 'team': row.team, 'round': row.round, 'bsid': row.bsid});
		});
		client.reply({'ok': true, 'rcs': data});
	});
}));

router.route('/cs/:id/active/rcs')
.get(db_request(function(req, client) {
	client.query('SELECT team, bsid, round FROM active_rcs WHERE csid=$1 ORDER BY round ASC', [req.params.id],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'team': row.team, 'bsid': row.bsid, 'round': row.round});
			});
		client.reply({'ok': true, 'rcs': data});
		});
}));

router.route('/cs/:id/active/rcs/:round')
.get(db_request(function(req, client) {
	client.query('SELECT team, bsid FROM active_rcs WHERE csid=$1 and round=$2', [req.params.id, req.params.round],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'team': row.team, 'bsid': row.bsid});
			});
		client.reply({'ok': true, 'rcs': data});
		});
}));

router.route('/cs/:id/active/pov')
.get(db_request(function(req, client) {
	client.query('SELECT pov.id, pov.team, pov_submission.id AS submission, pov_submission.target, pov_submission.throw_count, pov.hash, active_pov.round, active_rcs.bsid FROM active_pov INNER JOIN pov_submission ON pov_submission.id = active_pov.povsub INNER JOIN pov ON pov.id = pov_submission.pov INNER JOIN active_rcs ON active_pov.round = active_rcs.round AND active_rcs.team = pov_submission.target WHERE pov.csid=$1 ORDER BY active_pov.round, pov.team ASC', [req.params.id],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'povid': row.id, 'submission': row.submission, 'team': row.team, 'target': row.target, 'throw_count': row.throw_count, 'hash': row.hash, 'round': row.round, 'bsid': row.bsid});
		});
		client.reply({'ok': true, 'pov': data});
	});
}));

router.route('/cs/:id/active/pov/:round')
.get(db_request(function(req, client) {
	client.query('SELECT pov.id, pov.team, pov_submission.id AS submission, pov_submission.target, pov_submission.throw_count, pov.hash FROM active_pov INNER JOIN pov_submission ON pov_submission.id = active_pov.povsub INNER JOIN pov ON pov_submission.pov = pov.id WHERE pov.csid=$1 and active_pov.round=$2', [req.params.id, req.params.round],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'povid': row.id, 'submission': row.submission, 'team': row.team, 'target': row.target, 'throw_count': row.throw_count, 'hash': row.hash});
		});
		client.reply({'ok': true, 'pov': data});
	});
}));

router.route('/cs/:id/active/ids')
.get(db_request(function(req, client) {
	client.query('SELECT ids.id, ids_submission.team, ids_submission.id AS submission, ids.hash, active_ids.round FROM active_ids INNER JOIN ids_submission ON ids_submission.id = active_ids.idssub INNER JOIN ids ON ids.id = ids_submission.ids WHERE ids.csid=$1 ORDER BY active_ids.round ASC', [req.params.id],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'idsid': row.id, 'submission': row.submission, 'team': row.team, 'hash': row.hash, 'round': row.round});
		});
		client.reply({'ok': true, 'ids': data});
	});
}));

router.route('/cs/:id/active/ids/:round')
.get(db_request(function(req, client) {
	client.query('SELECT ids.id, ids_submission.team, ids_submission.id AS submission, ids.hash FROM active_ids INNER JOIN ids_submission ON ids_submission.id = active_ids.idssub INNER JOIN ids ON ids.id = ids_submission.ids WHERE ids.csid=$1 and active_ids.round=$2', [req.params.id, req.params.round],
	function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'idsid': row.id, 'submission': row.submission, 'team': row.team, 'hash': row.hash});
		});
		client.reply({'ok': true, 'ids': data});
	});
}));

router.route('/cs/:id/pov')
.get(db_request(function(req, client) {
	client.query('SELECT id, team, hash FROM pov WHERE csid=$1 AND team IS NOT NULL', [req.params.id], function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'povid': row.id, 'team': row.team, 'file': row.hash});
		});
		client.reply({'ok': true, 'pov': data});
	});
}));

router.route('/cs/:id/refpov')
.get(db_request(function(req, client) {
	client.query('SELECT id, hash FROM pov WHERE csid=$1 AND team IS NULL', [req.params.id], function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'povid': row.id, 'file': row.hash});
		});
		client.reply({'ok': true, 'pov': data});
	});
}));

router.route('/cs/:id/refpov/status')
.get(db_request(function(req, client) {
	client.query('SELECT pov.id, pov_replay.target AS bsid, pov_replay.pov_type, pov_replay.vulnerable, pov_replay.execution FROM pov LEFT JOIN pov_replay ON pov.id = pov_replay.pov WHERE pov.csid=$1 AND pov.team IS NULL AND pov_replay.idsid IS NULL',
		[req.params.id],
		function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push({'povid': row.id, 'bsid': row.bsid, 'pov_type': row.pov_type, 'vulnerable': row.vulnerable, 'execution': row.execution});
			});
			client.reply({'ok': true, 'status': data});
		});
}));

router.route('/cs/:id/poll')
.get(db_request(function(req, client) {
	client.query('SELECT id, hash FROM poll WHERE csid=$1 AND hash IS NOT NULL', [req.params.id], function (result) {
		var data = [];
		result.rows.forEach(function(row) {
			data.push({'pollid': row.id, 'file': row.hash});
		});
		client.reply({'ok': true, 'poll': data});
	});
}));

router.route('/cs/:id/poll/:count')
.get(db_request(function(req, client) {
	client.query('SELECT id, hash FROM poll WHERE csid=$1 AND hash IS NOT NULL ORDER BY id LIMIT $2',
		[req.params.id, req.params.count], function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push({'pollid': row.id, 'file': row.hash});
			});
			client.reply({'ok': true, 'poll': data});
		});
}));

router.route('/cs/:id/poll/status')
.get(db_request(function(req, client) {
	client.query('SELECT poll.id, rcs.id AS rcsid, rcs.bsid, poll_replay.idsid, poll_replay.pass, poll_replay.execution FROM poll INNER JOIN rcs ON poll.csid = rcs.csid LEFT JOIN poll_replay ON poll.id = poll_replay.poll AND poll_replay.bsid = rcs.bsid WHERE poll.csid=$1',
		[req.params.id],
		function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push({'pollid': row.id, 'rcsid': row.rcsid, 'bsid': row.bsid, 'idsid': row.idsid,
					'pass': row.pass, 'execution': row.execution});
			});
			client.reply({'ok': true, 'status': data});
		});
}));

router.route('/cs/:id/poll/ref/status')
.get(db_request(function(req, client) {
	client.query('select poll.id, cs.bsid, poll_replay.execution from poll inner join cs on cs.id = poll.csid left join poll_replay on poll.id = poll_replay.poll and poll_replay.bsid = cs.bsid where poll.csid=$1 and poll_replay.idsid is null',
		[req.params.id],
		function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push({'pollid': row.id, 'bsid': row.bsid, 'execution': row.execution});
			});
			client.reply({'ok': true, 'status': data});
		});
}));

router.route('/cs/:id/score')
.get(db_request(function(req, client) {
	client.query('SELECT teams.name AS team_name, teams.id AS team_id, cs_score.round, total, avail_score, func_score, timeout, connect_fail, perf_score, mem, cpu, file_size, security_score, eval_score, active_rcs.bsid, active_rcs.pending, active_rcs.pending_reason FROM cs_score INNER JOIN teams ON teams.id = cs_score.team INNER JOIN active_rcs ON active_rcs.round = cs_score.round AND active_rcs.team = cs_score.team AND active_rcs.csid = cs_score.csid WHERE cs_score.csid=$1 ORDER BY cs_score.round ASC',
		[req.params.id], function (result) {
			var teams = {};
			var teamids = [];

			result.rows.forEach(function(row) {
				var score = {"round": row.round, "total": row.total, "security": {"total": row.security_score},
					"evaluation": {"total": row.eval_score}, "availability": {"total": row.avail_score,
					"perf": {"total": row.perf_score, "mem-use": row.mem, "exec-time": row.cpu, "file-size": row.file_size},
					"func": {"total": row.func_score, "timeout": row.timeout, "connect-fail": row.connect_fail}},
					"bsid": row.bsid, "pending": row.pending, "pending_reason": row.pending_reason};
				if (!teams.hasOwnProperty(row.team_name))
					teams[row.team_name] = [];
				teams[row.team_name].push(score);
				teamids[row.team_name] = row.team_id;
			});

			var result = [];
			for (var team in teams) {
				result.push({"name": team, "id": teamids[team], "scores": teams[team]});
			}

			client.reply(result);
		});
}));

router.route('/rcs')
.post(db_request(function(req, client) {
	var team = req.body['team'];
	var csid = req.body['csid'];
	var round = req.body['round'];
	var bsid = req.body['bsid'];

	client.transaction(function() {
		client.query('INSERT INTO rcs (team, csid, round, bsid) VALUES ($1, $2, $3, $4) RETURNING id',
			[team, csid, round, bsid], function(result) {
				client.reply({'ok': true, 'rcsid': result.rows[0].id});
			});
	});
}));

router.route('/rcs/:id')
.get(db_request(function(req, client) {
	client.query('SELECT team, csid, round, bsid FROM rcs WHERE id=$1 ORDER BY round ASC', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'team': result.rows[0].team, 'csid': result.rows[0].csid, 'round': result.rows[0].round,
			'bsid': result.rows[0].bsid});
	});
}));

router.route('/refpatch')
.post(db_request(function(req, client) {
	var csid = req.body['csid'];
	var bsid = req.body['bsid'];
	var full = req.body['full'];

	client.transaction(function() {
		client.query('SELECT id FROM reference_patch WHERE csid=$1 AND bsid=$2', [csid, bsid], function (result) {
			if (result.rows.length > 0) {
				// Return existing patch if the same one was submitted more than once
				client.reply({'ok': true, 'id': result.rows[0].id});
				return;
			}

			client.query('INSERT INTO reference_patch (csid, bsid, full_patch) VALUES ($1, $2, $3) RETURNING id', [csid, bsid, full],
				function(result) {
					client.reply({'ok': true, 'id': result.rows[0].id});
				});
		});
	});
}));

router.route('/refpatch/:id')
.get(db_request(function(req, client) {
	client.query('SELECT csid, bsid FROM reference_patch WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var csid = result.rows[0].csid;
		var bsid = result.rows[0].bsid;

		client.query('SELECT hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [bsid], function (result) {
			var data = [];
			result.rows.forEach(function(row) {
				data.push(row.hash);
			});
			client.reply({'ok': true, 'csid': csid, 'bsid': bsid, 'files': data});
		});
	});
}));

router.route('/poll')
.post(db_request(function(req, client) {
	var csid = req.body['csid'];
	var polls = req.body['polls'];

	client.transaction(function() {
		var pollIds = [];

		var uploadPoll = function(i) {
			if (i >= polls.length) {
				client.reply({'ok': true, 'polls': pollIds});
				return;
			}

			var data = null;
			if (polls[i].hasOwnProperty('contents'))
				data = new Buffer(polls[i]['contents'], 'base64');
			var seed = polls[i]['seed'];
			var t = null;
			if (polls[i].hasOwnProperty('time'))
				t = polls[i]['time'];

			client.query('SELECT id, scheduled_time FROM poll WHERE seed=$1', [seed], function (result) {
				if (result.rows.length > 0) {
					// Return existing poll if one is submitted more than once
					pollIds.push({'id': result.rows[0].id, 'time': result.rows[0].scheduled_time});
					uploadPoll(i + 1);
					return;
				}

				if (data == null) {
					client.query('INSERT INTO poll (csid, seed, scheduled_time) VALUES ($1, $2, $3) RETURNING id',
						[csid, seed, t], function (result) {
							pollIds.push({'id': result.rows[0].id, 'time': t});
							uploadPoll(i + 1);
						});
				} else {
					upload(data, function(err, hash) {
						if (err) {
							console.error(err);
							client.error(500);
							return;
						}

						client.query('INSERT INTO poll (csid, hash, seed, scheduled_time) VALUES ($1, $2, $3, $4) RETURNING id',
							[csid, hash, seed, t], function (result) {
								pollIds.push({'id': result.rows[0].id, 'time': t});
								uploadPoll(i + 1);
							});
					});
				}
			});
		};

		uploadPoll(0);
	});
}));

router.route('/poll/:id')
.get(db_request(function(req, client) {
	client.query('SELECT csid, hash, seed, scheduled_time FROM poll WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'csid': result.rows[0].csid, 'file': result.rows[0].hash, 'seed': result.rows[0].seed, 'time': result.rows[0].scheduled_time});
	});
}));

router.route('/poll/:id/result/:bsid/score')
.get(db_request(function(req, client) {
	client.query('SELECT pass FROM poll_scored_result WHERE bsid=$1 AND poll=$2', [req.params.bsid, req.params.id],
		function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}
			client.reply({'ok': true, 'pass': result.rows[0].pass});
		});
}));

router.route('/bin/:id/stats')
.get(db_request(function(req, client) {
	get_bin_stats(req, client, true);
}));

function get_bin_stats(req, client, interactive) {
	client.query('SELECT binid, bin_hash, entropy, byte_histogram, sections, opcode_histogram, file_size, functions, blocks FROM bin_stats WHERE binid=$1', [req.params.id],
		function (result) {
			if (result.rows.length == 0) {
				client.query('SELECT hash FROM bin WHERE id=$1', [req.params.id], function (result) {
					if (result.rows.length == 0) {
						client.error(404);
						return;
					}

					if (req.params.id in pendingStats) {
						var existing = pendingStats[req.params.id];
						pendingStats[req.params.id] = function (data) {
							existing(data);
							if (client.isValid) {
								client.completeWork();
								client.reply(data);
							}
						};
					} else {
						pendingStats[req.params.id] = function (data) {
							if (client.isValid) {
								client.completeWork();
								client.reply(data);
							}
						};

						var entry = {'work': {'type': 'stats', 'bin_id': req.params.id, 'hash': result.rows[0].hash},
							'client': client};
						if (interactive)
							interactiveWorkQueue.push(entry);
						else
							priorityWorkQueue.push(entry);
						wake_worker();
					}
					client.done();
				});
			} else {
				client.reply({'ok': true, 'binid': result.rows[0].binid,
				'file': result.rows[0].bin_hash,
				'entropy': result.rows[0].entropy,
				'byte_histogram': result.rows[0].byte_histogram,
				'sections': result.rows[0].sections,
				'opcode_histogram': result.rows[0].opcode_histogram,
				'file_size': result.rows[0].file_size,
				'functions': result.rows[0].functions,
				'blocks': result.rows[0].blocks
			});
			}
		});
}

function get_poll_replay(req, client, ids, interactive) {
	var handle_poll = function (result) {
		if (result.rows.length == 0) {
			client.query('SELECT hash FROM poll WHERE id=$1', [req.params.id], function (result) {
				if (result.rows.length == 0) {
					client.error(404);
					return;
				}

				if (!(req.params.id in pendingPolls)) {
					pendingPolls[req.params.id] = {};
				}
				if (!(req.params.bsid in pendingPolls[req.params.id])) {
					pendingPolls[req.params.id][req.params.bsid] = {};
				}

				if (ids in pendingPolls[req.params.id][req.params.bsid]) {
					var existing = pendingPolls[req.params.id][req.params.bsid][ids];
					pendingPolls[req.params.id][req.params.bsid][ids] = function (data) {
						existing(data);
						if (client.isValid) {
							client.completeWork();
							client.reply(data);
						}
					};
				} else {
					pendingPolls[req.params.id][req.params.bsid][ids] = function (data) {
						if (client.isValid) {
							client.completeWork();
							client.reply(data);
						}
					};

					var entry = {'work': {'type': 'poll', 'poll': parseInt(req.params.id),
						'bsid': parseInt(req.params.bsid), 'idsid': ids, 'hash': result.rows[0].hash},
						'client': client};
					if (interactive)
						interactiveWorkQueue.push(entry);
					else
						priorityWorkQueue.push(entry);
					wake_worker();
				}
				client.done();
			});
		} else {
			client.reply({'ok': true, 'pass': result.rows[0].pass, 'execution': result.rows[0].execution});
		}
	};

	if (ids == null) {
		client.query('SELECT pass, execution FROM poll_replay WHERE bsid=$1 AND poll=$2 AND idsid IS NULL', [req.params.bsid, req.params.id],
			handle_poll);
	} else {
		client.query('SELECT pass, execution FROM poll_replay WHERE bsid=$1 AND poll=$2 AND idsid=$3', [req.params.bsid, req.params.id, ids],
			handle_poll);
	}
}

router.route('/poll/:id/result/:bsid/replay')
.get(db_request(function(req, client) {
	get_poll_replay(req, client, null, true);
}));

router.route('/poll/:id/result/:bsid/autoreplay')
.get(db_request(function(req, client) {
	get_poll_replay(req, client, null, false);
}));

router.route('/poll/:id/idsresult/:bsid/:idsid/replay')
.get(db_request(function(req, client) {
	get_poll_replay(req, client, req.params.idsid, true);
}));

router.route('/poll/:id/idsresult/:bsid/:idsid/autoreplay')
.get(db_request(function(req, client) {
	get_poll_replay(req, client, req.params.idsid, false);
}));

router.route('/pov')
.post(db_request(function(req, client) {
	var team = req.body['team'];
	var csid = req.body['csid'];
	var round = req.body['round'];
	var subs = req.body['submissions'];
	var throw_count = req.body['throw_count'];
	var data = new Buffer(req.body['pov'], 'base64');

	client.transaction(function() {
		upload(data, function(err, hash) {
			if (err) {
				console.error(err);
				client.error(500);
				return;
			}

			var povid = null;
			var submissions = [];

			var addPov = function(i) {
				if (i >= subs.length) {
					client.reply({'ok': true, 'povid': povid, 'submissions': submissions});
					return;
				}

				var target = subs[i]['target'];

				client.query('INSERT INTO pov_submission (pov, round, target, throw_count) VALUES ($1, $2, $3, $4) RETURNING id',
					[povid, round, target, throw_count],
					function (result) {
						submissions.push(result.rows[0].id);
						addPov(i + 1);
					});
			};

			client.query('SELECT id FROM pov WHERE team=$1 AND csid=$2 AND hash=$3', [team, csid, hash], function (result) {
				if (result.rows.length == 0) {
					client.query('INSERT INTO pov (team, csid, hash) VALUES ($1, $2, $3) RETURNING id', [team, csid, hash],
						function (result) {
							povid = result.rows[0].id;
							addPov(0);
						});
					return;
				}

				povid = result.rows[0].id;
				addPov(0);
			});
		});
	});
}));

router.route('/pov/:id')
.get(db_request(function(req, client) {
	client.query('SELECT team, csid, hash FROM pov WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		if (result.rows[0].team == null)
		{
			client.reply({'ok': true, 'team': result.rows[0].team, 'csid': result.rows[0].csid,
				'file': result.rows[0].hash, 'submissions': []});
			return;
		}
		client.query('SELECT id, round, target, throw_count FROM pov_submission WHERE pov=$1 ORDER BY round ASC', [req.params.id],
			function (submissions) {
				subs = [];
				submissions.rows.forEach(function (row) {
					subs.push({'id': row.id, 'round': row.round, 'target': row.target, 'throw_count': row.throw_count});
				});
				client.reply({'ok': true, 'team': result.rows[0].team, 'csid': result.rows[0].csid,
					'file': result.rows[0].hash, 'submissions': subs});
			});
	});
}));

router.route('/pov/submission/:id')
.get(db_request(function(req, client) {
	client.query('SELECT pov.id, pov.team, pov.csid, pov_submission.round, pov_submission.target, pov.hash FROM pov_submission INNER JOIN pov ON pov_submission.pov = pov.id WHERE pov_submission.id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'povid': result.rows[0].id, 'team': result.rows[0].team, 'csid': result.rows[0].csid,
			'round': result.rows[0].round, 'target': result.rows[0].target, 'file': result.rows[0].hash});
	});
}));

router.route('/pov/:id/result/:bsid/score')
.get(db_request(function(req, client) {
	client.query('SELECT pov_scored_result.vulnerable, pov_submission.target, pov_scored_result.round, pov_scored_result.throw AS throwid FROM pov_scored_result INNER JOIN pov_submission ON pov_scored_result.povsub = pov_submission.id WHERE pov_submission.pov=$1 AND pov_scored_result.target=$2 ORDER BY pov_scored_result.round ASC',
		[req.params.id, req.params.bsid],
		function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}
			client.reply({'ok': true, 'target': result.rows[0].target, 'round': result.rows[0].round,
				'throw': result.rows[0].throwid, 'vulnerable': result.rows[0].vulnerable});
		});
}));

function get_pov_replay(req, client, ids, interactive) {
	var handle_pov = function (result) {
		if (result.rows.length == 0) {
			client.query('SELECT hash FROM pov WHERE id=$1', [req.params.id], function (result) {
				if (result.rows.length == 0) {
					client.error(404);
					return;
				}

				if (!(req.params.id in pendingPovs)) {
					pendingPovs[req.params.id] = {};
				}
				if (!(req.params.target in pendingPovs[req.params.id])) {
					pendingPovs[req.params.id][req.params.target] = {};
				}

				if (ids in pendingPovs[req.params.id][req.params.target]) {
					var existing = pendingPovs[req.params.id][req.params.target][ids];
					pendingPovs[req.params.id][req.params.target][ids] = function (data) {
						existing(data);
						if (client.isValid) {
							client.completeWork();
							client.reply(data);
						}
					};
				} else {
					pendingPovs[req.params.id][req.params.target][ids] = function (data) {
						if (client.isValid) {
							client.completeWork();
							client.reply(data);
						}
					};

					var entry = {'work': {'type': 'pov', 'pov': parseInt(req.params.id),
						'bsid': parseInt(req.params.target), 'idsid': ids, 'hash': result.rows[0].hash},
						'client': client};
					if (interactive)
						interactiveWorkQueue.push(entry);
					else
						priorityWorkQueue.push(entry);
					wake_worker();
				}
				client.done();
			});
		} else {
			client.reply({'ok': true, 'pov_type': result.rows[0].pov_type, 'vulnerable': result.rows[0].vulnerable, 'execution': result.rows[0].execution});
		}
	};

	if (ids == null) {
		client.query('SELECT pov_replay.pov_type, pov_replay.vulnerable, pov_replay.execution FROM pov_replay WHERE pov=$1 AND target=$2 AND idsid IS NULL', [req.params.id, req.params.target],
			handle_pov);
	} else {
		client.query('SELECT pov_replay.pov_type, pov_replay.vulnerable, pov_replay.execution FROM pov_replay WHERE pov=$1 AND target=$2 AND idsid=$3', [req.params.id, req.params.target, ids],
			handle_pov);
	}
}

router.route('/pov/:id/result/:target/replay')
.get(db_request(function(req, client) {
	get_pov_replay(req, client, null, true);
}));

router.route('/pov/:id/result/:target/autoreplay')
.get(db_request(function(req, client) {
	get_pov_replay(req, client, null, false);
}));

router.route('/pov/:id/idsresult/:target/:idsid/replay')
.get(db_request(function(req, client) {
	get_pov_replay(req, client, req.params.idsid, true);
}));

router.route('/pov/:id/idsresult/:target/:idsid/autoreplay')
.get(db_request(function(req, client) {
	get_pov_replay(req, client, req.params.idsid, false);
}));

router.route('/ids')
.post(db_request(function(req, client) {
	var team = req.body['team'];
	var csid = req.body['csid'];
	var round = req.body['round'];
	var data = new Buffer(req.body['ids'], 'base64');

	client.transaction(function() {
		upload(data, function(err, hash) {
			if (err) {
				console.error(err);
				client.error(500);
				return;
			}

			client.query('SELECT id FROM ids WHERE csid=$1 AND hash=$2', [csid, hash], function (result) {
					if (result.rows.length > 0) {
						idsid = result.rows[0].id;
						client.query('INSERT INTO ids_submission (ids, team, round) VALUES ($1, $2, $3) RETURNING id',
							[idsid, team, round],
							function (result) {
								client.reply({'ok': true, 'idsid': idsid, 'submission': result.rows[0].id});
							});
						return;
					}

					client.query('INSERT INTO ids (csid, hash) VALUES ($1, $2) RETURNING id', [csid, hash],
						function (result) {
							idsid = result.rows[0].id;
							client.query('INSERT INTO ids_submission (ids, team, round) VALUES ($1, $2, $3) RETURNING id',
								[idsid, team, round],
								function (result) {
									client.reply({'ok': true, 'idsid': idsid, 'submission': result.rows[0].id});
								});
						});
				});
		});
	});
}));

router.route('/ids/:id')
.get(db_request(function(req, client) {
	client.query('SELECT csid, hash FROM ids WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'csid': result.rows[0].csid, 'file': result.rows[0].hash});
	});
}));

router.route('/ids/:id/info')
.get(db_request(function(req, client) {
	client.query('SELECT csid, hash FROM ids WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.query('SELECT bsid, name, shortname FROM cs WHERE id=$1', [result.rows[0].csid], function (cs_result) {
			if (cs_result.rows.length == 0) {
				client.error(500);
				return;
			}

			client.query('SELECT ids_submission.id, ids_submission.team, ids_submission.round, teams.name FROM ids_submission INNER JOIN teams ON ids_submission.team = teams.id WHERE ids=$1',
				[req.params.id], function (sub_result) {
					submissions = [];
					sub_result.rows.forEach(function (row) {
						submissions.push({'id': row.id, 'team': row.team, 'name': row.name, 'round': row.round});
					});
					client.reply({'ok': true, 'csid': result.rows[0].csid, 'cs_name': cs_result.rows[0].name,
						'ref_bsid': cs_result.rows[0].bsid, 'submissions': submissions, 'file': result.rows[0].hash,
						'cs_display_name': cs_result.rows[0].shortname});
				});
		});
	});
}));

router.route('/ids/:id/score')
.get(db_request(function(req, client) {
	client.query('SELECT cs_score.round, cs_score.csid, AVG(cs_score.total) AS total, AVG(cs_score.avail_score) AS avail_score, AVG(cs_score.func_score) AS func_score, AVG(cs_score.timeout) AS timeout, AVG(cs_score.connect_fail) AS connect_fail, AVG(cs_score.perf_score) AS perf_score, AVG(cs_score.mem) AS mem, AVG(cs_score.cpu) AS cpu, AVG(cs_score.file_size) AS file_size, AVG(cs_score.security_score) AS security_score, AVG(cs_score.eval_score) AS eval_score FROM cs_score INNER JOIN active_ids ON active_ids.round = cs_score.round INNER JOIN ids_submission ON active_ids.idssub = ids_submission.id AND ids_submission.team = cs_score.team INNER JOIN ids ON ids_submission.ids = ids.id AND ids.csid = cs_score.csid WHERE ids.id=$1 GROUP BY cs_score.round, cs_score.csid ORDER BY cs_score.round ASC', [req.params.id],
		function (result) {
			rounds = [];
			result.rows.forEach(function (row) {
				rounds.push({'round': row.round, 'csid': row.csid, 'total': row.total, 'avail_score': row.avail_score,
					'func_score': row.func_score, 'timeout': row.timeout, 'connect_fail': row.connect_fail,
					'perf_score': row.perf_score, 'mem': row.mem, 'cpu': row.cpu, 'file_size': row.file_size,
					'security_score': row.security_score, 'eval_score': row.eval_score});
			});
			client.reply({'ok': true, 'rounds': rounds});
		});
}));

router.route('/ids/submission/:id')
.get(db_request(function(req, client) {
	client.query('SELECT ids.id, ids_submission.team, ids.csid, ids_submission.round, ids.hash FROM ids_submission INNER JOIN ids ON ids_submission.ids = ids.id WHERE ids_submission.id=$1 ORDER BY ids_submission.round ASC',
		[req.params.id], function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}
			client.reply({'ok': true, 'idsid': result.rows[0].id, 'team': result.rows[0].team, 'csid': result.rows[0].csid,
				'round': result.rows[0].round, 'file': result.rows[0].hash});
		});
}));

router.route('/exec')
.post(db_request(function(req, client) {
	client.transaction(function() {
		var bsid = req.body["bsid"];
		var mem = req.body["mem"];
		var cpu = req.body["cpu"];
		var replays = [];
		for (var i = 0; i < req.body['replays'].length; i++) {
			replays.push(new Buffer(req.body['replays'][i], 'base64'));
		}

		if (replays.length < 1) {
			client.error(400);
			return;
		}

		client.query('INSERT INTO execution (bsid, mem, cpu) VALUES ($1, $2, $3) RETURNING id', [bsid, mem, cpu], function (result) {
			var execution = result.rows[0].id;

			var uploadReplay = function(i) {
				if (i >= req.body['replays'].length) {
					client.reply({'ok': true, 'execution': execution});
					return;
				}

				upload(replays[i], function(err, hash) {
					if (err) {
						console.error(err);
						client.rollback();
						client.error(500);
						return;
					}

					client.query('INSERT INTO execution_replay (execution, idx, hash) VALUES ($1, $2, $3)', [execution, i, hash],
						function (result) {
							uploadReplay(i + 1);
						});
				});
			};

			uploadReplay(0);
		});
	});
}));

router.route('/exec/:id/bin')
.get(db_request(function(req, client) {
	client.query('SELECT bin_set.hash, execution.bsid FROM execution INNER JOIN bin_set ON bin_set.id=execution.bsid WHERE execution.id=$1',
		[req.params.id],
		function(result) {
			var hash = result.rows[0].hash;
			var bsid = result.rows[0].bsid;
			client.query('SELECT hash FROM bin WHERE bsid=$1 ORDER BY idx ASC', [bsid], function (result) {
				var data = [];
				result.rows.forEach(function(row) {
					data.push(row.hash);
				});
				client.reply({'ok': true, 'bsid': bsid, 'hash': hash, 'files': data});
			});
		});
}));

router.route('/exec/:id/replay')
.get(db_request(function(req, client) {
	client.query('SELECT hash FROM execution_replay WHERE execution=$1 ORDER BY idx ASC', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var data = [];
		result.rows.forEach(function(row) {
			data.push(row.hash);
		});
		client.reply({'ok': true, 'files': data});
	});
}));

router.route('/exec/:id/perf')
.get(db_request(function(req, client) {
	client.query('SELECT mem, cpu FROM execution WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true, 'mem': result.rows[0].mem, 'cpu': result.rows[0].cpu});
	});
}));

router.route('/replay/poll')
.post(db_request(function(req, client) {
	var bsid = req.body["bsid"];
	var idsid = req.body["idsid"];
	var poll = req.body["poll"];
	var pass = req.body["pass"];
	var execution = req.body["execution"];

	client.transaction(function() {
		client.query('INSERT INTO poll_replay (bsid, idsid, poll, pass, execution) VALUES ($1, $2, $3, $4, $5)',
			[bsid, idsid, poll, pass, execution],
			function (result) {
				if ((poll in pendingPolls) && (bsid in pendingPolls[poll]) && (idsid in pendingPolls[poll][bsid])) {
					// There is a client waiting on the results of this poll, notify now
					pendingPolls[poll][bsid][idsid]({'ok': true, 'pass': pass, 'execution': execution});
					delete pendingPolls[poll][bsid][idsid];
				}

				client.reply({'ok': true});
			});
	});
}));

router.route('/replay/pov')
.post(db_request(function(req, client) {
	var pov = req.body["pov"];
	var bsid = req.body["bsid"];
	var idsid = req.body["idsid"];
	var pov_type = req.body["pov_type"];
	var vulnerable = req.body["vulnerable"];
	var execution = req.body["execution"];

	client.transaction(function() {
		client.query('INSERT INTO pov_replay (pov, target, idsid, pov_type, vulnerable, execution) VALUES ($1, $2, $3, $4, $5, $6)',
			[pov, bsid, idsid, pov_type, vulnerable, execution],
			function (result) {
				if ((pov in pendingPovs) && (bsid in pendingPovs[pov]) && (idsid in pendingPovs[pov][bsid])) {
					// There is a client waiting on the results of this poll, notify now
					pendingPovs[pov][bsid][idsid]({'ok': true, 'pov_type': pov_type, 'vulnerable': vulnerable, 'execution': execution});
					delete pendingPovs[pov][bsid][idsid];
				}

				client.reply({'ok': true});
			});
	});
}));

router.route('/active/pov')
.post(db_request(function(req, client) {
	var round = req.body["round"];
	var pov = req.body["povsub"];

	client.transaction(function() {
		var addPov = function(i) {
			if (i >= pov.length) {
				client.reply({'ok': true});
				return;
			}

			client.query('INSERT INTO active_pov (round, povsub) VALUES ($1, $2)', [round, pov[i]], function (result) {
				addPov(i + 1);
			});
		};

		addPov(0);
	});
}));

router.route('/active/rcs')
.post(db_request(function(req, client) {
	var round = req.body["round"];
	var rcs = req.body["rcs"];

	client.transaction(function() {
		var addRcs = function(i) {
			if (i >= rcs.length) {
				client.reply({'ok': true});
				return;
			}

			var team = rcs[i]["team"];
			var csid = rcs[i]["csid"];
			var bsid = rcs[i]["bsid"];
			var pending = rcs[i]["pending"];
			var reason = null;
			if (rcs[i]["pending"])
				reason = rcs[i]["pending_reason"];

			client.query('INSERT INTO active_rcs (round, team, csid, bsid, pending, pending_reason) VALUES ($1, $2, $3, $4, $5, $6)',
				[round, team, csid, bsid, pending, reason], function (result) {
					addRcs(i + 1);
				});
		};

		addRcs(0);
	});
}));

router.route('/active/ids')
.post(db_request(function(req, client) {
	var round = req.body["round"];
	var ids = req.body["idssub"];

	client.transaction(function() {
		var addIds = function(i) {
			if (i >= ids.length) {
				client.reply({'ok': true});
				return;
			}

			client.query('INSERT INTO active_ids (round, idssub) VALUES ($1, $2)', [round, ids[i]], function (result) {
				addIds(i + 1);
			});
		};

		addIds(0);
	});
}));

router.route('/active/:round/cs')
.get(db_request(function(req, client) {
	client.query('SELECT active_rcs.csid, cs.name FROM active_rcs INNER JOIN cs ON active_rcs.csid = cs.id WHERE round=$1 GROUP BY active_rcs.csid, cs.name ORDER BY active_rcs.csid',
		[req.params.round], function (result) {
			var cs = [];
			result.rows.forEach(function(row) {
				cs.push({'csid': row.csid, 'name': row.name});
			});
			client.reply({'ok': true, 'cs': cs});
		});
}));

router.route('/result/cs')
.post(db_request(function(req, client) {
	var team = req.body["team"];
	var round = req.body["round"];
	var cs = req.body["cs"];

	client.transaction(function() {
		var addCs = function(i) {
			if (i >= cs.length) {
				client.reply({'ok': true});
				return;
			}

			var csid = cs[i]["csid"];
			var total = cs[i]["total"];
			var avail_score = cs[i]["availability"];
			var func_score = cs[i]["functionality"];
			var timeout = cs[i]["timeout"];
			var connect_fail = cs[i]["connect_fail"];
			var perf_score = cs[i]["performance"];
			var mem = cs[i]["mem"];
			var cpu = cs[i]["cpu"];
			var file_size = cs[i]["file_size"];
			var security_score = cs[i]["security"];
			var eval_score= cs[i]["evaluation"];

			client.query('INSERT INTO cs_score (team, csid, round, total, avail_score, func_score, timeout, connect_fail, perf_score, mem, cpu, file_size, security_score, eval_score) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
				[team, csid, round, total, avail_score, func_score, timeout, connect_fail, perf_score, mem, cpu, file_size, security_score, eval_score],
				function (result) {
					addCs(i + 1);
				});
		};

		addCs(0);
	});
}));

router.route('/event/csadded')
.post(db_request(function(req, client) {
	var csid = req.body["csid"];
	var round = req.body["round"];

	client.transaction(function() {
		client.query('INSERT INTO cs_added (csid, round) VALUES ($1, $2)', [csid, round], function (result) {
			client.reply({'ok': true});
		});
	});
}));

router.route('/event/csremoved')
.post(db_request(function(req, client) {
	var csid = req.body["csid"];
	var round = req.body["round"];

	client.transaction(function() {
		client.query('INSERT INTO cs_removed (csid, round) VALUES ($1, $2)', [csid, round], function (result) {
			client.reply({'ok': true});
		});
	});
}));

router.route('/result/poll')
.post(db_request(function(req, client) {
	var bsid = req.body["bsid"];
	var team = req.body["team"];
	var round = req.body["round"];
	var polls = req.body["polls"];

	client.transaction(function() {
		var addPoll = function(i) {
			if (i >= polls.length) {
				client.reply({'ok': true});
				return;
			}

			var poll = polls[i];
			var pollid = poll["id"];
			var pass = poll["pass"];
			var t = poll["time"];
			var duration = poll["duration"];

			client.query({'text': 'INSERT INTO poll_scored_result (bsid, team, poll, round, pass, start_time, duration) VALUES ($1, $2, $3, $4, $5, $6, $7)', 'name': 'insert-poll-event'},
				[bsid, team, pollid, round, pass, t, duration], function (result) {
					addPoll(i + 1);
				});
		};

		addPoll(0);
	});
}));

router.route('/result/pov')
.post(db_request(function(req, client) {
	var round = req.body["round"];
	var throw_list = req.body["pov"];

	client.transaction(function() {
		var addPov = function(i) {
			if (i >= throw_list.length) {
				client.reply({'ok': true});
				return;
			}

			var pov = throw_list[i];
			var povid = pov["povsub"];
			var target = pov["target"];
			var pov_type = pov["type"];
			var vulnerable = pov["vulnerable"];
			var throw_num = pov["throw"];
			var t = pov["time"];
			var duration = pov["duration"];
			var seed = pov["seed"];

			client.query({'text': 'INSERT INTO pov_scored_result (povsub, target, round, throw, pov_type, vulnerable, start_time, duration, seed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', 'name': 'insert-pov-event'},
				[povid, target, round, throw_num, pov_type, vulnerable, t, duration, seed], function (result) {
					addPov(i + 1);
				});
		};

		addPov(0);
	});
}));

function get_cs_added_events(client, round, result, done) {
	client.query('SELECT csid FROM (SELECT active_rcs.csid, COUNT(last_round.csid) = 0 AS added FROM active_rcs LEFT JOIN active_rcs AS last_round ON active_rcs.csid = last_round.csid AND last_round.round = active_rcs.round - 1 WHERE active_rcs.round=$1 GROUP BY active_rcs.csid) AS new_cs WHERE added',
		[round], function (dbres) {
			dbres.rows.forEach(function(row) {
				result.push({"csid": row.csid});
			});

			done();
		});
}

function get_cs_removed_events(client, round, result, done) {
	client.query('SELECT csid FROM (SELECT active_rcs.csid, COUNT(next_round.csid) = 0 AS removed FROM active_rcs LEFT JOIN active_rcs AS next_round ON active_rcs.csid = next_round.csid AND next_round.round = active_rcs.round + 1 WHERE active_rcs.round=$1 - 1 GROUP BY active_rcs.csid) AS new_cs WHERE removed',
		[round], function (dbres) {
			dbres.rows.forEach(function(row) {
				result.push({"csid": row.csid});
			});

			done();
		});
}

function get_pov_submit_events(client, round, result, done) {
	client.query('SELECT pov.id, pov.team, pov_submission.target, pov.csid, active_rcs.bsid, pov_submission.throw_count FROM pov INNER JOIN pov_submission ON pov.id = pov_submission.pov INNER JOIN active_rcs ON pov.csid = active_rcs.csid AND pov_submission.target = active_rcs.team AND pov_submission.round = active_rcs.round WHERE pov_submission.round=$1',
		[round], function (dbres) {
			dbres.rows.forEach(function(row) {
				result.push({"povid": row.id, "source_team": row.team, "target_team": row.target, "target_csid": row.csid, "target_bsid": row.bsid, "throw_count": row.throw_count});
			});

			done();
		});
}

function get_pov_throw_events(client, round, result, done) {
	client.query('SELECT pov.id, pov.team, pov_submission.id AS submission, pov_submission.target, pov.csid, active_rcs.bsid, pov_scored_result.vulnerable, pov_scored_result.start_time, pov_scored_result.duration, pov_scored_result.pov_type FROM pov_scored_result INNER JOIN pov_submission ON pov_scored_result.povsub = pov_submission.id INNER JOIN pov ON pov.id = pov_submission.pov INNER JOIN active_rcs ON pov_submission.target = active_rcs.team AND pov.csid = active_rcs.csid AND active_rcs.round = pov_scored_result.round WHERE pov_scored_result.round=$1',
		[round], function(dbres) {
			dbres.rows.forEach(function(row) {
				var pov_result = "fail";
				if (row.vulnerable)
					pov_result = "succeed";

				var negotiate = "fail";
				if (row.pov_type == 1)
					negotiate = "type1";
				else if (row.pov_type == 2)
					negotiate = "type2";

				result.push({"povid": row.id, "submission": row.submission, "source_team": row.team, "target_team": row.target, "target_csid": row.csid, "target_bsid": row.bsid, "result": pov_result, "timestamp": row.start_time, "duration": row.duration, "negotiate": negotiate});
			});

			done();
		});
}

function get_pov_notthrown_events(client, round, result, done) {
	client.query('SELECT pov.id, pov_submission.id AS submission, pov.team, pov_submission.target, pov.csid FROM active_pov INNER JOIN pov_submission ON active_pov.povsub = pov_submission.id INNER JOIN pov ON pov.id = pov_submission.pov INNER JOIN active_rcs ON pov_submission.target = active_rcs.team AND pov.csid = active_rcs.csid AND active_rcs.round = active_pov.round WHERE active_pov.round=$1 AND active_rcs.pending',
		[round], function (dbres) {
			dbres.rows.forEach(function(row) {
				result.push({"povid": row.id, "submission": row.submission, "source_team": row.team, "target_team": row.target, "target_csid": row.csid});
			});

			done();
		});
}

function get_rcs_submit_events(client, round, result, done) {
	client.query('SELECT id, csid, team, bsid FROM rcs WHERE round=$1', [round], function (dbres) {
		dbres.rows.forEach(function(row) {
			result.push({"rcsid": row.id, "csid": row.csid, "team": row.team, "bsid": row.bsid});
		});

		done();
	});
}

function get_rcs_deploy_events(client, round, result, done) {
	client.query('SELECT team, csid, bsid FROM (SELECT team, csid, bsid, (SELECT pending FROM active_rcs AS last_round WHERE last_round.team = active_rcs.team AND last_round.csid = active_rcs.csid AND last_round.round = active_rcs.round - 1) AS last_pending FROM active_rcs WHERE NOT pending AND round=$1) AS deploy WHERE last_pending',
		[round], function(dbres) {
			dbres.rows.forEach(function(row) {
				result.push({"csid": row.csid, "team": row.team, "bsid": row.bsid});
			});

			done();
		});
}

function get_cs_offline_events(client, round, result, done) {
	client.query('SELECT csid, team, pending_reason FROM active_rcs WHERE pending AND round=$1', [round], function (dbres) {
		dbres.rows.forEach(function(row) {
			result.push({"csid": row.csid, "team": row.team, "reason": row.pending_reason});
		});

		done();
	});
}

function get_poll_events(client, round, result, done) {
	client.query('SELECT poll_scored_result.poll, poll_scored_result.team, poll.csid, poll_scored_result.bsid, poll_scored_result.pass, poll_scored_result.start_time, poll_scored_result.duration FROM poll_scored_result INNER JOIN poll ON poll_scored_result.poll = poll.id WHERE poll_scored_result.round=$1',
		[round], function (dbres) {
			dbres.rows.forEach(function(row) {
				var poll_result = "fail";

				if (row.pass)
					poll_result = "succeed";

				result.push({"pollid": row.poll, "target_team": row.team, "target_csid": row.csid, "target_bsid": row.bsid, "result": poll_result, "timestamp": row.start_time, "duration": row.duration});
			});

			done();
		});
}

router.route('/event/:round')
.get(db_request(function(req, client) {
	if (req.params.round in eventDataCache) {
		client.reply_data(eventDataCache[req.params.round]);
		return;
	}

	var cs_added = [];
	var cs_removed = [];
	var polls = [];
	var pov_submits = [];
	var pov_throws = [];
	var pov_notthrown = [];
	var rcs_submits = [];
	var rcs_deploys = [];
	var rule_submits = [];
	var rule_deploys = [];
	var cs_offline = [];

	get_cs_added_events(client, req.params.round, cs_added, function() {
		get_cs_removed_events(client, req.params.round, cs_removed, function() {
			get_pov_submit_events(client, req.params.round, pov_submits, function() {
				get_pov_throw_events(client, req.params.round, pov_throws, function() {
					get_pov_notthrown_events(client, req.params.round, pov_notthrown, function() {
						get_rcs_submit_events(client, req.params.round, rcs_submits, function() {
							get_rcs_deploy_events(client, req.params.round, rcs_deploys, function() {
								get_cs_offline_events(client, req.params.round, cs_offline, function() {
									get_poll_events(client, req.params.round, polls, function() {
										result = {"rounds": [{"round_index": req.params.round, "pre_round_events": {"cs_added": cs_added, "cs_removed": cs_removed}, "game_events": {"polls": polls, "pov_submission": pov_submits, "pov_throw": pov_throws, "pov_notthrown": pov_notthrown, "rcs_submission": rcs_submits, "rcs_deployed": rcs_deploys, "network_rule_submission": rule_submits, "network_rule_deployed": rule_deploys, "cs_offline": cs_offline}}]};
										result = JSON.stringify(result);
										eventDataCache[req.params.round] = result;
										client.reply_data(result);
									});
								});
							});
						});
					});
				});
			});
		});
	});
}));

router.route('/score/summary')
.get(db_request(function(req, client) {
	client.query('SELECT cs_score.team, cs_score.csid, (SELECT name FROM teams WHERE id = cs_score.team) AS team_name, ' +
		'(SELECT name FROM cs WHERE id = cs_score.csid) AS cs_name, ' +
		'(SELECT tag_list FROM cs WHERE id = cs_score.csid) AS cs_tag_list, ' +
		'(SELECT shortname FROM cs WHERE id = cs_score.csid) AS cs_display_name, AVG(total) AS avg_total, ' +
		'SUM(func_score) / SUM(CASE WHEN active_rcs.pending THEN 0 ELSE 1 END) AS avg_func_score, ' +
		'SUM(perf_score) / SUM(CASE WHEN active_rcs.pending THEN 0 ELSE 1 END) AS avg_perf_score, ' +
		'SUM(CASE WHEN active_rcs.pending THEN 0 ELSE security_score END) / SUM(CASE WHEN active_rcs.pending THEN 0 ELSE 1 END) AS avg_security_score, ' +
		'AVG(eval_score) AS avg_eval_score, SUM(CASE WHEN active_rcs.pending THEN 0 ELSE 1 END) as uptime, ' +
		'COUNT(cs_score.round) FROM cs_score INNER JOIN active_rcs ON active_rcs.team = cs_score.team AND ' +
		'active_rcs.csid = cs_score.csid AND active_rcs.round = cs_score.round GROUP BY cs_score.team, cs_score.csid',
		function (result) {
			var scores = [];
			result.rows.forEach(function (row) {
				scores.push({'team': row.team, 'team_name': row.team_name, 'csid': row.csid, 'cs_name': row.cs_name,
					'total': row.avg_total, 'func': row.avg_func_score, 'perf': row.avg_perf_score,
					'security': row.avg_security_score, 'eval': row.avg_eval_score, 'uptime': row.uptime,
					'rounds': row.count, "cs_display_name": row.cs_display_name, 'cs_tag_list': row.cs_tag_list})
			});
			client.reply({'ok': true, 'scores': scores});
		});
}));

router.route('/score/:round')
.get(db_request(function(req, client) {
	client.query('SELECT teams.name AS team_name, teams.id AS team_id, cs.name AS cs_name, cs.shortname AS cs_display_name, cs.tag_list AS cs_tag_list, cs_score.round, total, avail_score, func_score, timeout, connect_fail, perf_score, mem, cpu, file_size, security_score, eval_score, active_rcs.bsid, cs.bsid AS orig_bsid, cs.id AS orig_csid, active_rcs.pending, active_rcs.pending_reason FROM cs_score INNER JOIN teams ON teams.id = cs_score.team INNER JOIN cs ON cs.id = cs_score.csid INNER JOIN active_rcs ON active_rcs.round = cs_score.round AND active_rcs.team = cs_score.team AND active_rcs.csid = cs_score.csid WHERE cs_score.round=$1',
		[req.params.round], function (result) {
			client.query('SELECT ids.id, ids.csid, ids_submission.team FROM active_ids INNER JOIN ids_submission ON ids_submission.id = active_ids.idssub INNER JOIN ids ON ids.id = ids_submission.ids WHERE active_ids.round=$1', [req.params.round],
				function (ids_result) {
					var ids = {};
					ids_result.rows.forEach(function(row) {
						if (!ids.hasOwnProperty(row.team))
							ids[row.team] = {};
						ids[row.team][row.csid] = row.id;
					});

					var teams = {};
					var teamids = [];

					result.rows.forEach(function(row) {
						var cur_ids = null;
						if (ids.hasOwnProperty(row.team_id) && ids[row.team_id].hasOwnProperty(row.orig_csid))
							cur_ids = ids[row.team_id][row.orig_csid];
						var score = {"cset": row.cs_name, "cset_display_name": row.cs_display_name, "cset_tags": row.cs_tag_list, "cset_id": row.orig_csid, "total": row.total, "security": {"total": row.security_score}, "evaluation": {"total": row.eval_score}, "availability": {"total": row.avail_score, "perf": {"total": row.perf_score, "mem-use": row.mem, "exec-time": row.cpu, "file-size": row.file_size}, "func": {"total": row.func_score, "timeout": row.timeout, "connect-fail": row.connect_fail}}, "bsid": row.bsid, "orig_bsid": row.orig_bsid, "pending": row.pending, "pending_reason": row.pending_reason, "idsid": cur_ids};
						if (!teams.hasOwnProperty(row.team_name))
							teams[row.team_name] = [];
						teams[row.team_name].push(score);
						teamids[row.team_name] = row.team_id;
					});

					var reply_result = [];
					for (var team in teams) {
						reply_result.push({"name": team, "id": teamids[team],"submissions": teams[team]});
					}

					client.reply(reply_result);
				});
		});
}));

router.route('/complete/last')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM round_complete ORDER BY round DESC LIMIT 1', function (result) {
		if (result.rows.length == 0)
			client.reply({'ok': true, 'complete': false, 'round': req.params.round});
		else
			client.reply({'ok': true, 'complete': true, 'round': result.rows[0].round});
	});
}));

router.route('/complete/autoanalysis/:name')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM autoanalysis_round_complete WHERE name=$1 ORDER BY round DESC LIMIT 1', [req.params.name],
		function (result) {
			if (result.rows.length == 0)
				client.reply({'ok': true, 'complete': false, 'round': req.params.round});
			else
				client.reply({'ok': true, 'complete': true, 'round': result.rows[0].round});
		});
}));

router.route('/complete/autoanalysis/:name/:round')
.post(db_request(function(req, client) {
	client.transaction(function() {
		client.query('INSERT INTO autoanalysis_round_complete (round, name) VALUES ($1, $2)', [req.params.round, req.params.name],
			function (result) {
				client.reply({'ok': true});
			});
	});
}));

router.route('/complete/:round')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM round_complete WHERE round=$1', [req.params.round], function (result) {
		var complete = (result.rows.length > 0);
		client.reply({'ok': true, 'complete': complete});
	});
}))
.post(db_request(function(req, client) {
	client.transaction(function() {
		client.query('INSERT INTO round_complete (round) VALUES ($1)', [req.params.round], function (result) {
			populate_work_queue_for_round(req.params.round, client, function() {
				client.reply({'ok': true});
			});
		});
	});
}));

router.route('/complete/after/:round')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM round_complete WHERE round>$1 ORDER BY round ASC LIMIT 1', [req.params.round], function (result) {
		if (result.rows.length == 0)
			client.reply({'ok': true, 'complete': false, 'round': req.params.round});
		else
			client.reply({'ok': true, 'complete': true, 'round': result.rows[0].round});
	});
}));

router.route('/complete/previous/:round')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM round_complete WHERE round<$1 ORDER BY round DESC LIMIT 1', [req.params.round], function (result) {
		if (result.rows.length == 0)
			client.reply({'ok': true, 'complete': false, 'round': req.params.round});
		else
			client.reply({'ok': true, 'complete': true, 'round': result.rows[0].round});
	});
}));

router.route('/complete')
.get(db_request(function(req, client) {
	client.query('SELECT round FROM round_complete ORDER BY round ASC', [], function (result) {
		var rounds = [];
		result.rows.forEach(function (row) {
			rounds.push(row.round);
		});
		client.reply({'ok': true, 'rounds': rounds});
	});
}));

router.route('/analyze/complete/:id')
.post(db_request(function(req, client) {
	client.transaction(function() {
		var config = req.body["config"];
		var configText = JSON.stringify(config);

		var data = [];
		for (var i = 0; i < req.body['data'].length; i++) {
			data.push(new Buffer(req.body['data'][i], 'base64'));
		}

		if (data.length < 1) {
			client.error(400);
			return;
		}

		console.log(configText);

		client.query('INSERT INTO execution_analysis (execution, config) VALUES ($1, $2) RETURNING id', [req.params.id, configText],
			function (result) {
				var analysis = result.rows[0].id;
				var files = [];

				var uploadData = function(i) {
					if (i >= req.body['data'].length) {
						if ((req.params.id in pendingAnalysis) && (configText in pendingAnalysis[req.params.id])) {
							// There is a client waiting on the results of this analysis, notify now
							pendingAnalysis[req.params.id][configText]({'ok': true, 'result': files});
							delete pendingAnalysis[req.params.id][configText];
						}

						client.reply({'ok': true, 'id': analysis});
						return;
					}

					upload(data[i], function(err, hash) {
						if (err) {
							console.error(err);
							client.rollback();
							client.error(500);
							return;
						}

						files.push(hash);

						client.query('INSERT INTO execution_analysis_result (analysis, idx, hash) VALUES ($1, $2, $3)',
							[analysis, i, hash],
							function (result) {
								uploadData(i + 1);
							});
					});
				};

				uploadData(0);
			});
	});
}));

router.route('/analyze/fail/:id')
.post(db_request(function(req, client) {
	client.transaction(function() {
		var config = req.body["config"];
		var configText = JSON.stringify(config);

		if ((req.params.id in pendingAnalysis) && (configText in pendingAnalysis[req.params.id])) {
			// There is a client waiting on the results of this analysis, notify now
			pendingAnalysis[req.params.id][configText]({'ok': false});
			delete pendingAnalysis[req.params.id][configText];
		}

		client.reply({'ok': true});
	});
}));

router.route('/analyze/request/:id')
.post(db_request(function(req, client) {
	var execution = parseInt(req.params.id);
	var config = req.body["config"];
	var configText = JSON.stringify(config);

	client.query('SELECT id FROM execution_analysis WHERE execution=$1 AND config=$2', [execution, configText],
		function (result) {
			if (result.rows.length > 0) {
				// Analysis already completed, return existing results
				var analysis = result.rows[0].id;
				client.query('SELECT hash FROM execution_analysis_result WHERE analysis=$1 ORDER BY idx ASC',
					[analysis],
					function (result) {
						var data = [];
						for (var i = 0; i < result.rows.length; i++) {
							data.push(result.rows[i].hash);
						}
						client.reply({'ok': true, 'result': data});
					});
			} else {
				// Analysis not completed, add a work queue item for it
				client.query('SELECT bsid FROM execution WHERE id=$1', [execution], function (result) {
					var bsid = result.rows[0].bsid;

					if (!(execution in pendingAnalysis)) {
						pendingAnalysis[execution] = {};
					}

					pendingAnalysis[execution][configText] = function (data) {
						if (client.isValid) {
							client.completeWork();
							client.reply(data);
						}
					};

					var entry = {'work': {'type': 'analyze', 'execution': execution, 'bsid': bsid, 'config': config},
						'client': client};
					interactiveWorkQueue.push(entry);
					wake_worker();
					client.done();
				});
			}
		});
}));

router.route('/rank/:round')
.get(db_request(function(req, client) {
	client.query('SELECT team, score, name FROM rank INNER JOIN teams ON teams.id = rank.team WHERE round=$1 ORDER BY rank ASC', [req.params.round], function (result) {
		i = 1;
		ranks = [];
		result.rows.forEach(function (row) {
			ranks.push({'team': row.team, 'score': row.score, 'name': row.name});
		});
		client.reply({'ok': true, 'rank': ranks});
	});
}))
.post(db_request(function(req, client) {
	client.transaction(function() {
		var ranks = req.body["rank"];

		var addRank = function (i) {
			if (i >= ranks.length) {
				client.reply({'ok': true});
				return;
			}

			var team = ranks[i]['team'];
			var score = ranks[i]['score'];

			client.query('INSERT INTO rank (round, rank, team, score) VALUES ($1, $2, $3, $4)',
				[req.params.round, i + 1, team, score], function (result) {
					addRank(i + 1);
				});
		};

		addRank(0);
	});
}));

function get_work(res, workerid, wait) {
	if (workerid in workers) {
		// If this worker was already working on something and did not report the results, the work failed
		if (workers[workerid].pending != null) {
			// For work with no client, the work was simply complete, as there was nowhere to report it to.  These
			// are all background tasks and will be performed on-demand for a client if needed and not actually done.
			if (workers[workerid].pending.client != null) {
				if (workers[workerid].pending.client.isValid)
					console.log("Worker " + workerid + " did not report results from previous job, assuming failure");
				else
					console.log("Worker " + workerid + " finished work for client but was still marked pending");
				workers[workerid].pending.client.error(500);
			}
			workers[workerid].pending = null;
		}
		workers[workerid].lastSeen = Date.now();
	} else {
		workers[workerid] = {"pending": null, "lastSeen": Date.now()};
	}

	if (interactiveWorkQueue.length > 0) {
		// Work available in the interactive queue
		var item = interactiveWorkQueue.shift();
		workers[workerid].pending = item;
		workers[workerid].pendingQueue = interactiveWorkQueue;
		if (item['client'] != null)
			item['client'].worker = workers[workerid];
		res.json({'ok': true, 'work': item['work']});
	} else if (priorityWorkQueue.length > 0) {
		// Work available in the priority queue
		var item = priorityWorkQueue.shift();
		workers[workerid].pending = item;
		workers[workerid].pendingQueue = priorityWorkQueue;
		if (item['client'] != null)
			item['client'].worker = workers[workerid];
		res.json({'ok': true, 'work': item['work']});
	} else if (normalWorkQueue.length > 0) {
		// Work available in the normal queue
		var item = normalWorkQueue.shift();
		workers[workerid].pending = item;
		workers[workerid].pendingQueue = normalWorkQueue;
		if (item['client'] != null)
			item['client'].worker = workers[workerid];
		res.json({'ok': true, 'work': item['work']});
	} else if (wait) {
		// No work currently available, place this request in the wait queue for work
		var wait = new function() {
			var obj = this;
			var timeout = setTimeout(function() {
				// Wait timed out, return a response containing no work and remove from the wait queue
				res.json({'ok': true, 'work': null});
				for (var i = 0; i < waitingWorkers.length; i++) {
					if (waitingWorkers[i] === obj) {
						waitingWorkers.splice(i, 1);
						break;
					}
				}
			}, 10000);
			this.wake = function() {
				// Work is available for one or more workers, try to grab work
				clearTimeout(timeout);
				get_work(res, workerid, false);
			};
		};
		waitingWorkers.push(wait);
	} else {
		// No work available and not waiting, return response containing no work
		res.json({'ok': true, 'work': null});
	}
}

router.route('/work/:workerid')
.get(function (req, res, next) {
	get_work(res, req.params.workerid, true);
});

router.route('/work/:workerid/poll')
.get(function (req, res, next) {
	get_work(res, req.params.workerid, false);
});

router.route('/work/:workerid/heartbeat')
.get(function (req, res, next) {
	if (req.params.workerid in workers)
		workers[req.params.workerid].lastSeen = Date.now();
	res.json({'ok': true});
});

router.route('/status/work')
.get(function (req, res, next) {
	var interactiveLen = interactiveWorkQueue.length;
	var priorityLen = priorityWorkQueue.length;
	var normalLen = normalWorkQueue.length;
	var waitingLen = waitingWorkers.length;;

	var pendingLen = 0;
	for (var i in workers) {
		if (workers[i].pending != null)
			pendingLen++;
	}

	res.json({'ok': true, 'interactive': interactiveLen, 'priority': priorityLen, 'normal': normalLen, 'pending': pendingLen, 'waiting': waitingLen});
});

router.route('/story')
.get(db_request(function(req, client) {
	client.query('SELECT id, title, creator, owner, visualizer, priority, state, create_time, edit_time FROM story ORDER BY priority ASC, story_order DESC', [],
		function (result) {
			var stories = [];
			result.rows.forEach(function (row) {
				stories.push({'id': row.id, 'title': row.title, 'creator': row.creator, 'owner': row.owner, 
					'visualizer': row.visualizer, 'priority': row.priority, 'state': row.state, 
					'create_time': row.create_time, 'edit_time': row.edit_time});
			});
			client.reply({'ok': true, 'list': stories});
		});
}))
.post(db_request(function(req, client) {
	var title = req.body["title"];
	var desc = req.body["description"];
	var creator = req.body["creator"];
	var owner = req.body["owner"];
	var visualizer = req.body["visualizer"];
	var priority = req.body["priority"];
	var state = req.body["state"];
	client.transaction(function() {
		client.query('INSERT INTO story (title, description, creator, owner, visualizer, priority, state, create_time, edit_time, story_order) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), currval(\'story_id_seq\')) RETURNING id',
			[title, desc, creator, owner, visualizer, priority, state], function (result) {
				if (req.body.hasOwnProperty('unique_name')) {
					client.query('INSERT INTO auto_story_unique_name (name) VALUES ($1)', [req.body["unique_name"]],
						function (uniqueResult) {
							client.reply({'ok': true, 'id': result.rows[0].id});
						});
				} else {
					client.reply({'ok': true, 'id': result.rows[0].id});
				}
			});
	});
}));

router.route('/story/:id')
.get(db_request(function(req, client) {
	client.query('SELECT title, description, creator, owner, visualizer, priority, state, create_time, edit_time FROM story WHERE id=$1', [req.params.id],
		function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}

			client.query('SELECT id, contents, owner, create_time, edit_time FROM story_comment WHERE story=$1 ORDER BY id ASC', [req.params.id],
				function (comments) {
					var comment_list = [];
					comments.rows.forEach(function (row) {
						comment_list.push({'id': row.id, 'contents': row.contents, 'owner': row.owner,
							'create_time': row.create_time, 'edit_time': row.edit_time});
					});

					client.reply({'ok': true, 'title': result.rows[0].title, 'description': result.rows[0].description,
						'creator': result.rows[0].creator, 'owner': result.rows[0].owner, 'visualizer': result.rows[0].visualizer, 
						'priority': result.rows[0].priority, 'state': result.rows[0].state, 'create_time': result.rows[0].create_time, 
						'edit_time': result.rows[0].edit_time, 'comments': comment_list});
				});
		});
}))
.post(db_request(function(req, client) {
	var title = req.body["title"];
	var owner = req.body["owner"];
	var visualizer = req.body["visualizer"];
	var desc = req.body["description"];

	client.transaction(function() {
		client.query('SELECT title, owner, visualizer, description, edit_time FROM story WHERE id=$1', [req.params.id],
			function (result) {
				if (result.rows.length == 0) {
					client.error(404);
					return;
				}

				client.query('INSERT INTO story_history (story, title, owner, visualizer, description, edit_time) VALUES ($1, $2, $3, $4, $5, $6)',
					[req.params.id, result.rows[0].title, result.rows[0].owner, result.rows[0].visualizer, result.rows[0].description, result.rows[0].edit_time],
					function (result) {
						client.query('UPDATE story SET title=$1, owner=$2, visualizer=$3, description=$4, edit_time=NOW() WHERE id=$5',
							[title, owner, visualizer, desc, req.params.id], function (result) {
								client.reply({'ok': true});
							});
					});
			});
	});
}));

router.route('/story/:id/history')
.get(db_request(function(req, client) {
	client.query('SELECT title, description, edit_time FROM story WHERE id=$1', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}

		var data = [];
		data.push({'id': null, 'title': result.rows[0].title, 'description': result.rows[0].description,
			'timestamp': result.rows[0].edit_time});

		client.query('SELECT id, title, description, edit_time FROM story_history WHERE story=$1 ORDER BY edit_time DESC',
			[req.params.id], function (result) {
				result.rows.forEach(function (row) {
					data.push({'id': row.id, 'title': row.title, 'description': row.description, 'timestamp': row.edit_time});
				});
				client.reply({'ok': true, 'history': data});
			});
	});
}));

router.route('/story/:id/up')
.get(db_request(function(req, client) {
	client.query('SELECT story_up($1)', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true});
	});
}));

router.route('/story/:id/down')
.get(db_request(function(req, client) {
	client.query('SELECT story_down($1)', [req.params.id], function (result) {
		if (result.rows.length == 0) {
			client.error(404);
			return;
		}
		client.reply({'ok': true});
	});
}));

router.route('/story/:id/priority')
.get(db_request(function(req, client) {
	client.query('SELECT priority FROM story WHERE id=$1', [req.params.id],
		function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}

			client.reply({'ok': true, 'priority': result.rows[0].priority});
		});
}))
.post(db_request(function(req, client) {
	var priority = req.body["priority"];

	client.transaction(function() {
		client.query('UPDATE story SET priority=$1 WHERE id=$2', [priority, req.params.id],
			function (result) {
				client.reply({'ok': true});
			});
	});
}));

router.route('/story/:id/state')
.get(db_request(function(req, client) {
	client.query('SELECT state FROM story WHERE id=$1', [req.params.id],
		function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}

			client.reply({'ok': true, 'state': result.rows[0].state});
		});
}))
.post(db_request(function(req, client) {
	var state = req.body["state"];

	client.transaction(function() {
		client.query('UPDATE story SET state=$1 WHERE id=$2', [state, req.params.id],
			function (result) {
				client.reply({'ok': true});
			});
	});
}));

router.route('/story/:id/comment')
.get(db_request(function(req, client) {
	client.query('SELECT id, contents, owner, create_time, edit_time FROM story_comment WHERE story=$1 ORDER BY id ASC',
		[req.params.id], function (comments) {
			var comment_list = [];
			comments.rows.forEach(function (row) {
				comment_list.append({'id': row.id, 'contents': row.contents, 'owner': row.owner,
					'create_time': row.create_time, 'edit_time': row.edit_time});
			});

			client.reply({'ok': true, 'comments': comment_list});
		});
}))
.post(db_request(function(req, client) {
	var contents = req.body["contents"];
	var owner = req.body["owner"];

	client.transaction(function() {
		client.query('INSERT INTO story_comment (story, contents, owner, create_time, edit_time) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id',
			[req.params.id, contents, owner], function (result) {
				client.reply({'ok': true, 'id': result.rows[0].id});
			});
	});
}));

router.route('/story/:storyid/comment/:id')
.get(db_request(function(req, client) {
	client.query('SELECT contents, owner, create_time, edit_time FROM story_comment WHERE story=$1 AND id=$2',
		[req.params.storyid, req.params.id], function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}

			client.reply({'ok': true, 'contents': row.contents, 'owner': row.owner, 'create_time': row.create_time,
				'edit_time': row.edit_time});
		});
}))
.post(db_request(function(req, client) {
	var contents = req.body["contents"];

	client.transaction(function() {
		client.query('SELECT contents, edit_time FROM story_comment WHERE story=$1 AND id=$2',
			[req.params.storyid, req.params.id], function (result) {
				if (result.rows.length == 0) {
					client.error(404);
					return;
				}

				client.query('INSERT INTO story_comment_history (commentid, contents, edit_time) VALUES ($1, $2, $3)',
					[req.params.id, result.rows[0].contents, result.rows[0].edit_time], function (result) {
						client.query('UPDATE story_comment SET contents=$3, edit_time=NOW() WHERE story=$1 AND id=$2',
							[req.params.storyid, req.params.id, contents], function (result) {
								client.reply({'ok': true});
							});
					});
			});
	});
}));

router.route('/story/:storyid/comment/:id/history')
.get(db_request(function(req, client) {
	client.query('SELECT contents, edit_time FROM story_comment WHERE story=$1 AND id=$2',
		[req.params.storyid, req.params.id], function (result) {
			if (result.rows.length == 0) {
				client.error(404);
				return;
			}

			var data = [];
			data.push({'id': null, 'contents': result.rows[0].contents, 'timestamp': result.rows[0].edit_time});

			client.query('SELECT id, contents, edit_time FROM story_comment_history WHERE commentid=$1', [req.params.id],
				function (result) {
					result.rows.forEach(function (row) {
						data.push({'id': row.id, 'contents': row.contents, 'timestamp': row.edit_time});
					});
					client.reply({'ok': true, 'history': data});
				});
		});
}));

router.route('/story/:storyid/comment/:id/delete')
.post(db_request(function(req, client) {
	client.transaction(function() {
		client.query('DELETE FROM story_comment_history WHERE commentid=$1', [req.params.id],
			function (result) {
				client.query('DELETE FROM story_comment WHERE id=$1', [req.params.id],
					function (result) {
						client.reply({'ok': true});
					});
			});
	});
}));

router.route('/story/auto/:name')
.get(db_request(function(req, client) {
	client.query('SELECT COUNT(*) AS num FROM auto_story_unique_name WHERE name=$1', [req.params.name],
		function (result) {
			var found = (result.rows[0].num != 0);
			client.reply({'ok': true, 'exists': found});
		});
}))
.post(db_request(function(req, client) {
	client.transaction(function() {
		client.query('INSERT INTO auto_story_unique_name (name) VALUES ($1)', [req.params.name],
			function (result) {
				client.reply({'ok': true});
			});
	});
}));

router.route('/ui/status')
.get(function (req, res, next) {
	res.send(statusTemplate({filter: "none"}));
});

router.route('/ui/status/production')
.get(function (req, res, next) {
	res.send(statusTemplate({filter: "production"}));
});

router.route('/ui/status/visualization')
.get(function (req, res, next) {
	res.send(statusTemplate({filter: "visualization"}));
});

router.route('/ui/status/owned')
.get(function (req, res, next) {
	res.send(statusTemplate({filter: "owned"}));
});

router.route('/ui/round')
.get(function (req, res, next) {
	res.send(roundTemplate({round: "null"}));
});

router.route('/ui/round/:round')
.get(function (req, res, next) {
	res.send(roundTemplate({round: req.params.round}));
});

router.route('/ui/binset/:bsid')
.get(function (req, res, next) {
	res.send(binaryTemplate({bsid: req.params.bsid}));
});

router.route('/ui/binset/:bsid/:idsid')
.get(function (req, res, next) {
	res.send(binaryAndIdsTemplate({bsid: req.params.bsid, idsid: req.params.idsid}));
});

router.route('/ui/ids/:idsid')
.get(function (req, res, next) {
	res.send(idsTemplate({idsid: req.params.idsid}));
});

router.route('/ui/pov/:povid')
.get(function (req, res, next) {
	res.send(povTemplate({povid: req.params.povid}));
});

router.route('/ui/poll/:pollid')
.get(function (req, res, next) {
	res.send(pollTemplate({pollid: req.params.pollid}));
});

router.route('/ui/cs/:csid')
.get(function (req, res, next) {
	res.send(csTemplate({csid: req.params.csid}));
});

router.route('/ui/team/:team')
.get(function (req, res, next) {
	res.send(teamTemplate({team: req.params.team}));
});

router.route('/ui/story/:id/history')
.get(function (req, res, next) {
	res.send(storyHistoryTemplate({story: req.params.id}));
});

router.route('/ui/story/:storyid/comment/:id/history')
.get(function (req, res, next) {
	res.send(storyCommentHistoryTemplate({story: req.params.storyid, comment: req.params.id}));
});

router.route('/ui/markdown')
.get(function (req, res, next) {
	res.send(markdownReferenceTemplate({reference: markdownReference}));
});

router.route('/upload')
.post(db_request(function(req, client) {
	var contents = new Buffer(req.body['contents'], 'base64');
	var name = encodeURIComponent(req.body['name']);
	uploadUserFile(contents, name, function(err, hash) {
		if (err) {
			console.error(err);
			client.error(500);
			return;
		}
		client.reply({'ok': true, 'hash': hash, 'name': name});
	});
}));

app.use('/', router)
app.use('/data', express.static(storePath))
app.use('/upload/data', express.static(uploadPath))
app.use('/html', express.static('html'))
app.use('/js', express.static('js'))
app.use('/img', express.static('img'))
app.use('/css', express.static('css'))

app.redirect('/', '/ui/status')

function check_for_dead_workers() {
	var liveWorkers = [];
	for (var i in workers) {
		if ((Date.now() - workers[i].lastSeen) > 30000) {
			// Worker is no longer responding, place work back in the work queue
			console.log("Worker " + i + " has stopped responding");
			if (workers[i].pending != null)
				workers[i].pendingQueue.push(workers[i].pending);
		} else {
			// Worker is OK
			liveWorkers[i] = workers[i];
		}
	}
	workers = liveWorkers;

	setTimeout(check_for_dead_workers, 10000);
}

function start_server() {
	var port = process.argv[2] || 8000
	var server = app.listen(port, function() {
		console.log("Server started.");
	});
	server.timeout = 0;
}

// Populate work queues for existing work that has not been completed
early_db_request(function (client) {
	client.query('SELECT round FROM round_complete', function (result) {
		var rounds = [];
		for (var i = 0; i < result.rows.length; i++) {
			rounds.push(result.rows[i].round);
		}

		var processRound = function(i) {
			if (i >= rounds.length) {
				// Done populating work queues, start the server process
				start_server();
				return;
			}

			populate_work_queue_for_round(rounds[i], client, function () {
				processRound(i + 1);
			});
		};

		processRound(0);
	});
});

setTimeout(check_for_dead_workers, 10000);
