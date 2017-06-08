
active_pollid = null;
poll_info = null;
poll_results = [];
poll_queue = [];
poll_queue_wait = [];
want_fast_poll_update = false;

function update_poll_info() {
	$("#bin-num").html("Poll " + active_pollid.toString());

	$.ajax({
		url: key + "poll/" + active_pollid.toString(),
		success: function(data) {
			$.ajax({
				url: key + "cs/" + data['csid'].toString(),
				success: function(cs_info) {
					poll_info = data;

					var download_html = '<p>Download: <a href="' + key + 'data/' + data['file'] + '">Poll</a>';

					$("#poll-info").html('<p>Poll for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
						'">' + cs_info['shortname'] + '</a><br/>' + download_html + '</p>');

					update_binary_polls();
				}
			});
		}
	});
}

function get_ref_binary_html(ref_bin, ref_patches) {
	var poll_html = '<h5>Poll against reference binary</h5><table><tbody>';
	var target = [ref_bin, null].toString();
	if (typeof poll_results[target] === "undefined") {
		poll_html += '<tr><div><a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a></div></tr>';
		if (poll_queue.indexOf(ref_bin) == -1)
			request_poll_result(ref_bin);
	} else if (poll_results[target]['pass']) {
		poll_html += '<tr><div><span class="success label">Success</span> ' +
			'<a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a>, ' +
			'Exec ' + poll_results[target]['execution'] + ', ' +
			poll_results[target]['cpu'].toString() + ' instructions</div></tr>';
	} else {
		poll_html += '<tr><div><span class="alert label">Fail</span> ' +
			'<a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a>, ' +
			'Exec ' + poll_results[target]['execution'] + ', ' +
			poll_results[target]['cpu'].toString() + ' instructions</div></tr>';
	}
	poll_html += "</tbody></table>";

	poll_html += '<h5>Poll against reference patches</h5><table><tbody>';
	for (var i = 0; i < ref_patches.length; i++) {
		var bsid = ref_patches[i];
		var patch_target = [bsid, null];
		if (typeof poll_results[patch_target] === "undefined") {
			poll_html += '<tr><div><a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a></div></tr>';
			if (poll_queue.indexOf(bsid) == -1)
				request_poll_result(bsid);
		} else if (poll_results[patch_target]['pass']) {
			poll_html += '<tr><div><span class="success label">Success</span> ' +
				'<a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a>, ' +
				'Exec ' + poll_results[patch_target]['execution'] + ', ' +
				poll_results[patch_target]['cpu'].toString() + ' instructions</div></tr>';
		} else {
			poll_html += '<tr><div><span class="alert label">Fail</span> ' +
				'<a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a>, ' +
				'Exec ' + poll_results[patch_target]['execution'] + ', ' +
				poll_results[patch_target]['cpu'].toString() + ' instructions</div></tr>';
		}
	}
	poll_html += "</tbody></table>";
	return poll_html;
}

function render_binary_polls(data, ids_data, teams, ref_bin, ref_patches) {
	want_fast_poll_update = false;

	var poll_html = get_ref_binary_html(ref_bin, ref_patches);

	poll_html += '<h5>Poll against replacement binaries</h5><table><thead><tr><th>Round</th>';
	var team_cols = [];
	var rcs = [];
	var ids = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		poll_html += '<th><a href="' + key + 'ui/team/' + teams['teams'][i]['id'].toString() + '">' +
			teams['teams'][i]['name'] + '</a></th>';
		team_cols.push(teams['teams'][i]['id']);
		rcs[teams['teams'][i]['id']] = [];
		ids[teams['teams'][i]['id']] = [];
	}
	poll_html += '</tr></thead><tbody>';

	var rounds = [];
	for (var i = 0; i < data['rcs'].length; i++) {
		if (rounds.indexOf(data['rcs'][i]['round']) == -1)
			rounds.push(data['rcs'][i]['round']);
	}
	for (var i = 0; i < ids_data['ids'].length; i++) {
		if (rounds.indexOf(ids_data['ids'][i]['round']) == -1)
			rounds.push(ids_data['ids'][i]['round']);
	}

	for (var i = 0; i < team_cols.length; i++) {
		for (var j = 0; j < rounds.length; j++) {
			rcs[team_cols[i]][rounds[j]] = [];
			ids[team_cols[i]][rounds[j]] = null;
		}
	}

	for (var i = 0; i < data['rcs'].length; i++) {
		rcs[data['rcs'][i]['team']][data['rcs'][i]['round']].push(data['rcs'][i]);
	}

	for (var i = 0; i < ids_data['ids'].length; i++) {
		ids[ids_data['ids'][i]['team']][ids_data['ids'][i]['round']] = ids_data['ids'][i];
	}

	for (var i = 0; i < rounds.length; i++) {
		poll_html += '<tr><td valign="top"><a href="' + key + 'ui/round/' + rounds[i].toString() + '">' + rounds[i].toString() + '</a></td>';
		for (var j = 0; j < team_cols.length; j++) {
			poll_html += '<td>';
			if (rcs[team_cols[j]][rounds[i]].length == 0) {
				poll_html += "<small><i>None</i></small>";
			} else {
				for (var k = 0; k < rcs[team_cols[j]][rounds[i]].length; k++) {
					var bsid = rcs[team_cols[j]][rounds[i]][k]['bsid'];
					var idsid = null;
					if (ids[team_cols[j]][rounds[i]] != null)
						idsid = ids[team_cols[j]][rounds[i]]['idsid'];
					var target = [bsid, idsid].toString();
					var target_noids = [bsid, null].toString();
					var bin_html = '<div><a href="' + key + 'ui/binset/' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() +
						'">Binary ' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() + '</a></div>';
					if (idsid == null) {
						bin_html += '<div><small><i>No IDS</i></small></div>';
					} else {
						bin_html += '<div><a href="' + key + 'ui/ids/' + idsid.toString() +
							'">IDS ' + idsid.toString() + '</a></div>';
					}
					if ((typeof poll_results[target] === "undefined") || (typeof poll_results[target_noids] === "undefined")) {
						poll_html += bin_html;
						if (poll_queue.indexOf(target) == -1)
							request_poll_result(bsid, idsid);
					} else if (poll_results[target]['pass']) {
						poll_html += bin_html + 'Exec ' + poll_results[target]['execution'] + '<br/>' +
							'<small>' + poll_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="success label">Success</span></div>';
					} else if (poll_results[target_noids]['pass']) {
						poll_html += bin_html + 'Exec ' + poll_results[target]['execution'] + '<br/>' +
							'<small>' + poll_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="warning label">IDS Blocked</span></div>';
					} else {
						poll_html += bin_html + 'Exec ' + poll_results[target]['execution'] + '<br/>' +
							'<small>' + poll_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="alert label">Fail</span></div>';
					}
				}
			}
			poll_html += '</td>';
		}
		poll_html += '</tr>';
	}

	poll_html += '</tbody></table>';

	$('#bin-list').html(poll_html);
}

function update_binary_polls() {
	$.ajax({
		url: key + "cs/" + poll_info['csid'].toString() + "/active/rcs",
		success: function(data) {
			$.ajax({
				url: key + "cs/" + poll_info['csid'].toString() + "/active/ids",
				success: function(ids_data) {
					$.ajax({
						url: key + "team",
						success: function(teams) {
							$.ajax({
								url: key + "cs/" + poll_info['csid'].toString(),
								success: function(cs_info) {
									$.ajax({
										url: key + "cs/" + poll_info['csid'].toString() + "/refpatch",
										success: function(cs_patches) {
											render_binary_polls(data, ids_data, teams, cs_info['bsid'], cs_patches['bsid']);
										}
									});
								}
							});
						}
					});
				}
			});
		}
	});
}

function request_poll_result(bsid, idsid) {
	var target = [bsid, idsid].toString();

	if (poll_queue.length > 8) {
		poll_queue_wait.push(target);
		return;
	}

	$.ajax({
		url: key + "poll/" + active_pollid.toString() + "/result/" + bsid.toString() + "/replay",
		success: function (data) {
			$.ajax({
				url: key + "exec/" + data['execution'].toString() + "/perf",
				success: function (perf) {
					if (idsid == null) {
						if (poll_queue.indexOf(target) != -1) {
							poll_queue.splice(poll_queue.indexOf(target), 1);
						}

						poll_results[target] = data;
						poll_results[target]['cpu'] = perf['cpu'];
						want_fast_poll_update = true;

						if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
							request_poll_result(poll_queue_wait.pop());
						}
					} else {
						$.ajax({
							url: key + "poll/" + active_pollid.toString() + "/idsresult/" + bsid.toString() + "/" +
								idsid.toString() + "/replay",
							success: function (idsdata) {
								$.ajax({
									url: key + "exec/" + idsdata['execution'].toString() + "/perf",
									success: function (idsperf) {
										if (poll_queue.indexOf(target) != -1) {
											poll_queue.splice(poll_queue.indexOf(target), 1);
										}

										var target_no_ids = [bsid, null].toString();
										poll_results[target_no_ids] = data;
										poll_results[target_no_ids]['cpu'] = perf['cpu'];
										poll_results[target] = idsdata;
										poll_results[target]['cpu'] = idsperf['cpu'];
										want_fast_poll_update = true;

										if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
											request_poll_result(poll_queue_wait.pop());
										}
									},
									error: function() {
										if (poll_queue.indexOf(target) != -1) {
											poll_queue.splice(poll_queue.indexOf(target), 1);
										}
										if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
											request_poll_result(poll_queue_wait.pop());
										}
									}
								});
							},
							error: function() {
								if (poll_queue.indexOf(target) != -1) {
									poll_queue.splice(poll_queue.indexOf(target), 1);
								}
								if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
									request_poll_result(poll_queue_wait.pop());
								}
							}
						});
					}
				},
				error: function() {
					if (poll_queue.indexOf(target) != -1) {
						poll_queue.splice(poll_queue.indexOf(target), 1);
					}
					if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
						request_poll_result(poll_queue_wait.pop());
					}
				}
			});
		},
		error: function() {
			if (poll_queue.indexOf(target) != -1) {
				poll_queue.splice(poll_queue.indexOf(target), 1);
			}
			if ((poll_queue_wait.length > 0) && (poll_queue.length < 8)) {
				request_poll_result(poll_queue_wait.pop());
			}
		}
	});
}

function update() {
	update_poll_info();
	setTimeout(update, 10000);
}

function fast_update() {
	if (want_fast_poll_update) {
		update_binary_polls();
	}
	setTimeout(fast_update, 200);
}

function initial_update(pollid) {
	active_pollid = pollid;
	update();
	fast_update();
}
