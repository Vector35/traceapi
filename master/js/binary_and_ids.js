active_bsid = null;
active_idsid = null;
bin_info = null;
pov_results = [];
pov_queue = [];
pov_queue_wait = [];
want_fast_pov_update = false;
poll_results = [];
poll_queue = [];
poll_queue_wait = [];
want_poll_update = false;
polls_populated = false;

function update_binary_info() {
	$("#bin-num").html('<a href="' + key + 'ui/binset/' + active_bsid.toString() + '">' + 'Binary ' + active_bsid.toString() + '</a> with ' +
		'<a href="' + key + 'ui/ids/' + active_idsid.toString() + '">' + 'IDS ' + active_idsid.toString() + '</a>');

	$.ajax({
		url: key + "binset/" + active_bsid.toString() + "/info",
		success: function(data) {
			$.ajax({
				url: key + "ids/" + active_idsid.toString() + "/info",
				success: function(ids_data) {
					binary_info = data;

					var bin_download_html = '<p>Binary download: ';
					var disasm_html = 'Disassemble: ';
					for (var i = 0; i < data['files'].length; i++) {
						if (i > 0) {
							bin_download_html += ", ";
							disasm_html += ", ";
						}
						bin_download_html += '<a href="' + key + 'data/' + data['files'][i] + '">Part ' + (i + 1).toString() + '</a>';
						disasm_html += '<a href="binaryninja:' + window.location.origin.replace(/:/g,'%3a') + key + 'data/' + data['files'][i] + '">Part ' + (i + 1).toString() + '</a>';
					}

					bin_download_html += '<br/>' + disasm_html + '</p>';

					var ids_download_html = '<p><a href="' + key + 'data/' + ids_data['file'] + '">IDS download</a></p>';

					var ref_html = 'Reference binary: <a href="' + key + 'ui/binset/' + data['ref_bsid'].toString() + '">' +
						data['ref_bsid'].toString() + '</a>';

					var patch_html = 'Reference patches: ';
					for (var i = 0; i < data['ref_patch'].length; i++) {
						if (i > 0)
							patch_html += ", ";
						patch_html += '<a href="' + key + 'ui/binset/' + data['ref_patch'][i].toString() + '">' +
							data['ref_patch'][i].toString() + '</a>';
					}

					if (data['type'] == 'ref') {
						$("#bin-info").html('<p>Reference binary for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
							'">' + data['cs_display_name'] + '</a><br/>' + patch_html + '</p>');
						$("#bin-info").append(bin_download_html + ids_download_html);
						$("#bin-score").html('<p><i>No score available for reference binaries.</i></p>');

						update_ref_binary_povs();
					} else if (data['type'] == 'refpatch') {
						$("#bin-info").html('<p>Reference patch for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
							'">' + data['cs_display_name'] + '</a><br/>' + ref_html + '</p>');
						$("#bin-info").append(bin_download_html + ids_download_html);
						$("#bin-score").html('<p><i>No score available for reference patches.</i></p>');

						update_ref_binary_povs();
					} else {
						$("#bin-info").html('<p>Replacement binary for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
							'">' + data['cs_display_name'] + '</a><br/>' + ref_html + '<br/>' + patch_html + '</p>');
						for (var i = 0; i < data['submissions'].length; i++) {
							$("#bin-info").append('Submission from <a href="' + key + 'ui/team/' + data['submissions'][i]['team'].toString() + '">' +
								data['submissions'][i]['name'] + '</a> in <a href="' + key + 'ui/round/' + data['submissions'][i]['round'].toString() +
								'">round ' + data['submissions'][i]['round'].toString() + '</a><br/>');
						}
						$("#bin-info").append(bin_download_html + ids_download_html);

						update_binary_scores();
					}

					if (!polls_populated) {
						want_poll_update = true;
						polls_populated = true;
					}
				}
			});
		}
	});
}

function update_binary_scores() {
	$.ajax({
		url: key + "binset/" + active_bsid.toString() + "/score",
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

			$('#bin-score').html(score_html + '</tbody></table>');

			update_binary_povs();
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
	var unthrown = [];
	var seen_hashes = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		pov_html += '<th><a href="' + key + 'ui/team/' + teams['teams'][i]['id'].toString() + '">' +
			teams['teams'][i]['name'] + '</a></th>';
		team_cols.push(teams['teams'][i]['id']);
		povs[teams['teams'][i]['id']] = [];
		unthrown[teams['teams'][i]['id']] = [];
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
		}
	}

	for (var i = 0; i < data['pov'].length; i++) {
		if (data['pov'][i]['bsid'] == active_bsid) {
			povs[data['pov'][i]['team']][data['pov'][i]['round']].push(data['pov'][i]);
			seen_hashes[data['pov'][i]['team']].push(data['pov'][i]['hash']);
		}
	}

	var found_unthrown = false;
	for (var i = 0; i < data['pov'].length; i++) {
		if ((data['pov'][i]['bsid'] != active_bsid) &&
			(seen_hashes[data['pov'][i]['team']].indexOf(data['pov'][i]['hash']) == -1)) {
			unthrown[data['pov'][i]['team']].push(data['pov'][i]);
			seen_hashes[data['pov'][i]['team']].push(data['pov'][i]['hash']);
			found_unthrown = true;
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

	if (found_unthrown) {
		pov_html += "<p><h5>PoVs not thrown against this replacement binary</h5></p><table><tbody>";
		for (var i = 0; i < team_cols.length; i++) {
			if (unthrown[team_cols[i]].length != 0) {
				pov_html += '<tr><td width="150" valign="top">From <a href="' + key + 'ui/team/' +
					teams['teams'][i]['id'].toString() + '">' +
					teams['teams'][i]['name'] + '</a></td><td>';

				for (var j = 0; j < unthrown[team_cols[i]].length; j++) {
					var povid = unthrown[team_cols[i]][j]['povid'];
					if (typeof pov_results[povid] === "undefined") {
						pov_html += '<div><a href="' + key + 'ui/pov/' + unthrown[team_cols[i]][j]['povid'] +
							'">PoV ' + unthrown[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
							unthrown[team_cols[i]][j]['round'].toString() + '">round ' +
							unthrown[team_cols[i]][j]['round'].toString() + '</a></div>';
						if (pov_queue.indexOf(povid) == -1)
							request_pov_result(povid);
					} else if (pov_results[povid]['vulnerable']) {
						pov_html += '<div><span class="alert label">Vulnerable: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
							'<a href="' + key + 'ui/pov/' + unthrown[team_cols[i]][j]['povid'] +
							'">PoV ' + unthrown[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
							unthrown[team_cols[i]][j]['round'].toString() + '">round ' +
							unthrown[team_cols[i]][j]['round'].toString() + '</a>, ' +
							'Exec ' + pov_results[povid]['execution'] + ', ' +
							pov_results[povid]['cpu'].toString() + ' instructions</div>';
					} else if (pov_results[povid]['pov_type'] == 0) {
						pov_html += '<div><span class="label">Invalid</span> ' +
							'<a href="' + key + 'ui/pov/' + unthrown[team_cols[i]][j]['povid'] +
							'">PoV ' + unthrown[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
							unthrown[team_cols[i]][j]['round'].toString() + '">round ' +
							unthrown[team_cols[i]][j]['round'].toString() + '</a>, ' +
							'Exec ' + pov_results[povid]['execution'] + ', ' +
							pov_results[povid]['cpu'].toString() + ' instructions</div>';
					} else {
						pov_html += '<div><span class="success label">Defended: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
							'<a href="' + key + 'ui/pov/' + unthrown[team_cols[i]][j]['povid'] +
							'">PoV ' + unthrown[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
							unthrown[team_cols[i]][j]['round'].toString() + '">round ' +
							unthrown[team_cols[i]][j]['round'].toString() + '</a>, ' +
							'Exec ' + pov_results[povid]['execution'] + ', ' +
							pov_results[povid]['cpu'].toString() + ' instructions</div>';
					}
				}

				pov_html += '</td></tr>';
			}
		}
		pov_html += "</tbody></table>";
	}

	$('#pov-list').html(pov_html);
}

function render_ref_povs(data, teams, refpovs) {
	want_fast_pov_update = false;

	var pov_html = get_ref_pov_html(refpovs);

	var team_cols = [];
	var povs = [];
	var seen_hashes = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		team_cols.push(teams['teams'][i]['id']);
		povs[teams['teams'][i]['id']] = [];
		seen_hashes[teams['teams'][i]['id']] = [];
	}

	for (var i = 0; i < data['pov'].length; i++) {
		if (seen_hashes[data['pov'][i]['team']].indexOf(data['pov'][i]['hash']) == -1) {
			povs[data['pov'][i]['team']].push(data['pov'][i]);
			seen_hashes[data['pov'][i]['team']].push(data['pov'][i]['hash']);
		}
	}

	pov_html += "<p><h5>PoVs submitted against this challenge</h5></p><table><tbody>";
	for (var i = 0; i < team_cols.length; i++) {
		if (povs[team_cols[i]].length != 0) {
			pov_html += '<tr><td width="150" valign="top">From <a href="' + key + 'ui/team/' +
				teams['teams'][i]['id'].toString() + '">' +
				teams['teams'][i]['name'] + '</a></td><td>';

			for (var j = 0; j < povs[team_cols[i]].length; j++) {
				var povid = povs[team_cols[i]][j]['povid'];
				if (typeof pov_results[povid] === "undefined") {
					pov_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[i]][j]['povid'] +
						'">PoV ' + povs[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
						povs[team_cols[i]][j]['round'].toString() + '">round ' +
						povs[team_cols[i]][j]['round'].toString() + '</a></div>';
					if (pov_queue.indexOf(povid) == -1)
						request_pov_result(povid);
				} else if (pov_results[povid]['vulnerable']) {
					pov_html += '<div><span class="alert label">Vulnerable: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
						'<a href="' + key + 'ui/pov/' + povs[team_cols[i]][j]['povid'] +
						'">PoV ' + povs[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
						povs[team_cols[i]][j]['round'].toString() + '">round ' +
						povs[team_cols[i]][j]['round'].toString() + '</a>, ' +
						'Exec ' + pov_results[povid]['execution'] + ', ' +
						pov_results[povid]['cpu'].toString() + ' instructions</div>';
				} else if (pov_results[povid]['pov_type'] == 0) {
					pov_html += '<div><span class="label">Invalid</span> ' +
						'<a href="' + key + 'ui/pov/' + povs[team_cols[i]][j]['povid'] +
						'">PoV ' + povs[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
						povs[team_cols[i]][j]['round'].toString() + '">round ' +
						povs[team_cols[i]][j]['round'].toString() + '</a>, ' +
						'Exec ' + pov_results[povid]['execution'] + ', ' +
						pov_results[povid]['cpu'].toString() + ' instructions</div>';
				} else {
					pov_html += '<div><span class="success label">Defended: Type ' + pov_results[povid]['pov_type'].toString() + '</span> ' +
						'<a href="' + key + 'ui/pov/' + povs[team_cols[i]][j]['povid'] +
						'">PoV ' + povs[team_cols[i]][j]['povid'] + '</a> in <a href="' + key + 'ui/round/' +
						povs[team_cols[i]][j]['round'].toString() + '">round ' +
						povs[team_cols[i]][j]['round'].toString() + '</a>, ' +
						'Exec ' + pov_results[povid]['execution'] + ', ' +
						pov_results[povid]['cpu'].toString() + ' instructions</div>';
				}
			}

			pov_html += '</td></tr>';
		}
	}
	pov_html += "</tbody></table>";

	$('#pov-list').html(pov_html);
}

function update_binary_povs() {
	$.ajax({
		url: key + "cs/" + binary_info['csid'].toString() + "/active/pov",
		success: function(data) {
			$.ajax({
				url: key + "team",
				success: function(teams) {
					$.ajax({
						url: key + "cs/" + binary_info['csid'].toString() + "/refpov",
						success: function(refpovs) {
							render_povs(data, teams, refpovs);
						}
					});
				}
			});
		}
	});
}

function update_ref_binary_povs() {
	$.ajax({
		url: key + "cs/" + binary_info['csid'].toString() + "/active/pov",
		success: function(data) {
			$.ajax({
				url: key + "team",
				success: function(teams) {
					$.ajax({
						url: key + "cs/" + binary_info['csid'].toString() + "/refpov",
						success: function(refpovs) {
							render_ref_povs(data, teams, refpovs);
						}
					});
				}
			});
		}
	});
}

function update_binary_polls() {
	$.ajax({
		url: key + "cs/" + binary_info['csid'].toString() + '/poll/20',
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
		url: key + "pov/" + povid.toString() + "/idsresult/" + active_bsid.toString() + "/" + active_idsid.toString() + "/replay",
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
		url: key + "poll/" + pollid.toString() + "/idsresult/" + active_bsid.toString() + "/" + active_idsid.toString() + "/replay",
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
	update_binary_info();
	setTimeout(update, 10000);
}

function fast_update() {
	if (want_fast_pov_update) {
		if ((binary_info['type'] == 'ref') || (binary_info['type'] == 'refpatch'))
			update_ref_binary_povs();
		else
			update_binary_povs();
	}
	if (want_poll_update) {
		update_binary_polls();
	}
	setTimeout(fast_update, 200);
}

function initial_update(bsid, idsid) {
	active_bsid = bsid;
	active_idsid = idsid;
	update();
	fast_update();
}
