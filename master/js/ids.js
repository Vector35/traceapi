active_idsid = null;
ids_info = null;
pov_results = [];
pov_queue = [];
pov_queue_wait = [];
want_fast_pov_update = false;
poll_results = [];
poll_queue = [];
poll_queue_wait = [];
want_poll_update = false;
polls_populated = false;

function update_ids_info() {
	$("#ids-num").html("IDS " + active_idsid.toString());

	$.ajax({
		url: key + "ids/" + active_idsid.toString() + "/info",
		success: function(data) {
			ids_info = data;

			var download_html = '<p><a href="' + key + 'data/' + data['file'] + '">Download</a></p>';

			var ref_html = 'Reference binary: <a href="' + key + 'ui/binset/' + data['ref_bsid'].toString() + '">' +
				data['ref_bsid'].toString() + '</a>';

			$("#ids-info").html('<p>IDS for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
				'">' + data['cs_display_name'] + '</a><br/>' + ref_html + '<br/></p>');
			for (var i = 0; i < data['submissions'].length; i++) {
				$("#ids-info").append('Submission from <a href="' + key + 'ui/team/' + data['submissions'][i]['team'].toString() + '">' +
					data['submissions'][i]['name'] + '</a> in <a href="' + key + 'ui/round/' + data['submissions'][i]['round'].toString() +
					'">round ' + data['submissions'][i]['round'].toString() + '</a><br/>');
			}
			$("#ids-info").append(download_html);

			update_ids_scores();

			if (!polls_populated) {
				want_poll_update = true;
				polls_populated = true;
			}
		}
	});
}

function update_ids_scores() {
	$.ajax({
		url: key + "ids/" + active_idsid.toString() + "/score",
		success: function(data) {
			var score_html = '<table><thead><tr><th width="70">Round</th><th>Functionality</th><th width="100"></th><th width="100">CPU Usage</th><th width="100">Memory Usage</th><th>Performance</th><th width="100"></th><th><b>Availability</b></th><th width="100"></th><th><b>Security</b></th><th width="100"></th></tr></thead><tbody>';

			for (var i = 0; i < data['rounds'].length; i++) {
				score_html += '<tr><td><a href="' + key + 'ui/round/' + data['rounds'][i]['round'].toString() + '">';
				score_html += data['rounds'][i]['round'].toString() + '</a></td>';

				score_html += '<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
					data['rounds'][i]['func_score'].toString() +
					'" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
					(data['rounds'][i]['func_score'] * 100.0).toString() + '%"' + '</div></div></td>';
				score_html += "<td>" + (Math.trunc(data['rounds'][i]['func_score'] * 1000.0) / 1000.0).toString() + "</td>";

				score_html += "<td>" + Math.trunc(data['rounds'][i]['cpu'] * 100.0).toString() + "%</td>";
				score_html += "<td>" + Math.trunc(data['rounds'][i]['mem'] * 100.0).toString() + "%</td>";

				score_html += '<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
					data['rounds'][i]['perf_score'].toString() +
					'" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
					(data['rounds'][i]['perf_score'] * 100.0).toString() + '%"' + '</div></div></td>';
				score_html += "<td>" + (Math.trunc(data['rounds'][i]['perf_score'] * 1000.0) / 1000.0).toString() + "</td>";

				score_html += '<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
					data['rounds'][i]['avail_score'].toString() +
					'" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
					(data['rounds'][i]['avail_score'] * 100.0).toString() + '%"' + '</div></div></td>';
				score_html += "<td>" + (Math.trunc(data['rounds'][i]['avail_score'] * 1000.0) / 1000.0).toString() + "</td>";

				score_html += '<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
					data['rounds'][i]['security_score'].toString() +
					'" aria-valuemin="0" aria-valuemax="2"><div class="progress-meter" style="width: ' +
					((data['rounds'][i]['security_score'] - 1.0) * 100.0).toString() + '%"' + '</div></div></td>';
				score_html += "<td>" + (Math.trunc(data['rounds'][i]['security_score'] * 1000.0) / 1000.0).toString() + "</td>";

				score_html += "</tr>";
			}

			$('#ids-score').html(score_html + '</tbody></table>');

			update_ids_povs();
		}
	});
}

function get_ref_pov_html(refpovs) {
	var pov_html = '<h5>Reference PoVs</h5><table><tbody>';
	for (var i = 0; i < refpovs['pov'].length; i++) {
		var povid = refpovs['pov'][i]['povid'];
		if (typeof pov_results[povid] === "undefined") {
			pov_html += '<tr><div><a href="' + key + 'ui/pov/' + povid.toString() +
				'">PoV ' + povid.toString() + '</a></div></tr>';
			if (pov_queue.indexOf(povid) == -1)
				request_pov_result(povid);
		} else if (pov_results[povid]['vulnerable']) {
			pov_html += '<tr><div><span class="alert label">Vulnerable: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
				'<a href="' + key + 'ui/pov/' + povid.toString() +
				'">PoV ' + povid.toString() + '</a>, ' +
				'Exec ' + pov_results[povid]['execution'] + ', ' +
				pov_results[povid]['cpu'].toString() + ' instructions</div></tr>';
		} else if (pov_results[povid]['pov_type'] == 0) {
			pov_html += '<tr><div><span class="label">Invalid</span> ' +
				'<a href="' + key + 'ui/pov/' + povid.toString() +
				'">PoV ' + povid.toString() + '</a>, ' +
				'Exec ' + pov_results[povid]['execution'] + ', ' +
				pov_results[povid]['cpu'].toString() + ' instructions</div></tr>';
		} else {
			pov_html += '<tr><div><span class="success label">Defended: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
				'<a href="' + key + 'ui/pov/' + povid.toString() +
				'">PoV ' + povid.toString() + '</a>, ' +
				'Exec ' + pov_results[povid]['execution'] + ', ' +
				pov_results[povid]['cpu'].toString() + ' instructions</div></tr>';
		}
	}
	pov_html += "</tbody></table>";
	return pov_html;
}

function render_povs(data, teams, refpovs) {
	want_fast_pov_update = false;

	var pov_html = get_ref_pov_html(refpovs);

	pov_html += '<h5>Live PoVs</h5><table><thead><tr><th>Round</th>';
	var team_cols = [];
	var povs = [];
	var seen_hashes = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		pov_html += '<th><a href="' + key + 'ui/team/' + teams['teams'][i]['id'].toString() + '">' +
			teams['teams'][i]['name'] + '</a></th>';
		team_cols.push(teams['teams'][i]['id']);
		povs[teams['teams'][i]['id']] = [];
		seen_hashes[teams['teams'][i]['id']] = [];
	}
	pov_html += '</tr></thead><tbody>';

	var rounds = [];
	for (var i = 0; i < data['pov'].length; i++) {
		if (rounds.indexOf(data['pov'][i]['round']) == -1)
			rounds.push(data['pov'][i]['round']);
	}

	for (var i = 0; i < team_cols.length; i++) {
		for (var j = 0; j < rounds.length; j++) {
			povs[team_cols[i]][rounds[j]] = [];
			seen_hashes[team_cols[i]][rounds[j]] = [];
		}
	}

	for (var i = 0; i < data['pov'].length; i++) {
		if (seen_hashes[data['pov'][i]['team']][data['pov'][i]['round']].indexOf(data['pov'][i]['hash']) == -1) {
			povs[data['pov'][i]['team']][data['pov'][i]['round']].push(data['pov'][i]);
			seen_hashes[data['pov'][i]['team']][data['pov'][i]['round']].push(data['pov'][i]['hash']);
		}
	}

	for (var i = 0; i < rounds.length; i++) {
		pov_html += '<tr><td valign="top"><a href="' + key + 'ui/round/' + rounds[i].toString() + '">' + rounds[i].toString() + '</a></td>';
		for (var j = 0; j < team_cols.length; j++) {
			pov_html += '<td>';
			if (povs[team_cols[j]][rounds[i]].length == 0) {
				pov_html += "<small><i>None</i></small>";
			} else {
				for (var k = 0; k < povs[team_cols[j]][rounds[i]].length; k++) {
					var povid = povs[team_cols[j]][rounds[i]][k]['povid'];
					if (typeof pov_results[povid] === "undefined") {
						pov_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() +
							'">PoV ' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() + '</a></div>';
						if (pov_queue.indexOf(povid) == -1)
							request_pov_result(povid);
					} else if (pov_results[povid]['vulnerable']) {
						pov_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() +
							'">PoV ' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() + '</a><br/>' +
							'Exec ' + pov_results[povid]['execution'] + '<br/>' +
							'<small>' + pov_results[povid]['cpu'] + ' instrs</small>' +
							'<br/><span class="alert label">Vulnerable: Type ' + pov_results[povid]['pov_type'].toString() + '</span></div>';
					} else if (pov_results[povid]['pov_type'] == 0) {
						pov_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() +
							'">PoV ' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() + '</a><br/>' +
							'Exec ' + pov_results[povid]['execution'] + '<br/>' +
							'<small>' + pov_results[povid]['cpu'] + ' instrs</small>' +
							'<br/><span class="label">Invalid</span></div>';
					} else {
						pov_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() +
							'">PoV ' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() + '</a><br/>' +
							'Exec ' + pov_results[povid]['execution'] + '<br/>' +
							'<small>' + pov_results[povid]['cpu'] + ' instrs</small>' +
							'<br/><span class="success label">Defended: Type ' + pov_results[povid]['pov_type'].toString() + '</span></div>';
					}
				}
			}
			pov_html += '</td>';
		}
		pov_html += '</tr>';
	}

	pov_html += '</tbody></table>';

	$('#pov-list').html(pov_html);
}

function update_ids_povs() {
	$.ajax({
		url: key + "cs/" + ids_info['csid'].toString() + "/active/pov",
		success: function(data) {
			$.ajax({
				url: key + "team",
				success: function(teams) {
					$.ajax({
						url: key + "cs/" + ids_info['csid'].toString() + "/refpov",
						success: function(refpovs) {
							render_povs(data, teams, refpovs);
						}
					});
				}
			});
		}
	});
}

function update_ids_polls() {
	$.ajax({
		url: key + "cs/" + ids_info['csid'].toString() + '/poll/20',
		success: function(data) {
			want_poll_update = false;

			var poll_html = '';
			for (var i = 0; i < data['poll'].length; i++) {
				var pollid = data['poll'][i]['pollid'];
				if (typeof poll_results[pollid] === "undefined") {
					poll_html += '<div><a href="' + key + 'ui/poll/' + data['poll'][i]['pollid'] +
						'">Poll ' + data['poll'][i]['pollid'] + '</a></div>';
					if (poll_queue.indexOf(pollid) == -1)
						request_poll_result(pollid);
				} else if (poll_results[pollid]['pass']) {
					poll_html += '<div><span class="success label">Success</span> ' +
						'<a href="' + key + 'ui/poll/' + data['poll'][i]['pollid'] +
						'">Poll ' + data['poll'][i]['pollid'] + '</a>, ' +
						'Exec ' + poll_results[pollid]['execution'] + ', ' +
						poll_results[pollid]['cpu'].toString() + ' instructions</div>';
				} else {
					poll_html += '<div><span class="alert label">Fail</span> ' +
						'<a href="' + key + 'ui/poll/' + data['poll'][i]['pollid'] +
						'">Poll ' + data['poll'][i]['pollid'] + '</a>, ' +
						'Exec ' + poll_results[pollid]['execution'] + ', ' +
						poll_results[pollid]['cpu'].toString() + ' instructions</div>';
				}
			}

			$("#poll-list").html(poll_html);
		}
	});
}

function request_pov_result(povid) {
	if (pov_queue.length > 8) {
		pov_queue_wait.push(povid);
		return;
	}

	$.ajax({
		url: key + "pov/" + povid.toString() + "/idsresult/" + ids_info['ref_bsid'].toString() + "/" + active_idsid.toString() + "/replay",
		success: function (data) {
			$.ajax({
				url: key + "exec/" + data['execution'].toString() + "/perf",
				success: function (perf) {
					if (pov_queue.indexOf(povid) != -1) {
						pov_queue.splice(pov_queue.indexOf(povid), 1);
					}

					pov_results[povid] = data;
					pov_results[povid]['cpu'] = perf['cpu'];
					want_fast_pov_update = true;

					if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
						request_pov_result(pov_queue_wait.pop());
					}
				},
				error: function() {
					if (pov_queue.indexOf(povid) != -1) {
						pov_queue.splice(pov_queue.indexOf(povid), 1);
					}
					if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
						request_pov_result(pov_queue_wait.pop());
					}
				}
			});
		},
		error: function() {
			if (pov_queue.indexOf(povid) != -1) {
				pov_queue.splice(pov_queue.indexOf(povid), 1);
			}
			if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
				request_pov_result(pov_queue_wait.pop());
			}
		}
	});
}

function request_poll_result(pollid) {
	if (poll_queue.length > 8) {
		poll_queue_wait.push(pollid);
		return;
	}

	$.ajax({
		url: key + "poll/" + pollid.toString() + "/idsresult/" + ids_info['ref_bsid'].toString() + '/' + active_idsid.toString() + "/replay",
		success: function (data) {
			$.ajax({
				url: key + "exec/" + data['execution'].toString() + "/perf",
				success: function (perf) {
					if (poll_queue.indexOf(pollid) != -1) {
						poll_queue.splice(poll_queue.indexOf(pollid), 1);
					}

					poll_results[pollid] = data;
					poll_results[pollid]['cpu'] = perf['cpu'];
					want_poll_update = true;

					if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
						request_poll_result(poll_queue_wait.pop());
					}
				},
				error: function() {
					if (poll_queue.indexOf(pollid) != -1) {
						poll_queue.splice(poll_queue.indexOf(pollid), 1);
					}
					if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
						request_poll_result(poll_queue_wait.pop());
					}
				}
			});
		},
		error: function() {
			if (poll_queue.indexOf(pollid) != -1) {
				poll_queue.splice(poll_queue.indexOf(pollid), 1);
			}
			if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
				request_poll_result(poll_queue_wait.pop());
			}
		}
	});
}

function update() {
	update_ids_info();
	setTimeout(update, 10000);
}

function fast_update() {
	if (want_fast_pov_update) {
		update_ids_povs();
	}
	if (want_poll_update) {
		update_ids_polls();
	}
	setTimeout(fast_update, 200);
}

function initial_update(idsid) {
	active_idsid = idsid;
	update();
	fast_update();
}
