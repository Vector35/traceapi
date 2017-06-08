
active_povid = null;
pov_info = null;
pov_results = [];
pov_queue = [];
pov_queue_wait = [];
want_fast_pov_update = false;

function update_pov_info() {
	$("#bin-num").html("PoV " + active_povid.toString());

	$.ajax({
		url: key + "pov/" + active_povid.toString(),
		success: function(data) {
			$.ajax({
				url: key + "cs/" + data['csid'].toString(),
				success: function(cs_info) {
					$.ajax({
						url: key + "team",
						success: function(teams) {
							pov_info = data;

							var teams_by_id = [];
							for (var i = 0; i < teams['teams'].length; i++)
								teams_by_id[teams['teams'][i]['id']] = teams['teams'][i]['name'];

							var download_html = '<p>Download: <a href="' + key + 'data/' + data['file'] + '">PoV executable</a><br/>';
							download_html += 'Disassemble: <a href="binaryninja:' + window.location.origin.replace(/:/g,'%3a') + key + 'data/' + data['file'] + '">PoV executable</a></p>';

							if (data['team'] == null) {
								$("#pov-info").html('<p>Reference PoV for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
									'">' + cs_info['shortname'] + '</a><br/>' + download_html + '</p>');

								update_binary_povs();
							} else {
								$("#pov-info").html('<p>PoV for challenge <a href="' + key + 'ui/cs/' + data['csid'].toString() +
									'">' + cs_info['shortname'] + '</a><br/>' + download_html + '</p>');
								for (var i = 0; i < data['submissions'].length; i++) {
									var throw_str;
									if (data['submissions'][i]['throw_count'] == 1)
										throw_str = "throw";
									else
										throw_str = "throws";
									$("#pov-info").append('Submission from <a href="' + key + 'ui/team/' + data['team'].toString() + '">' +
										teams_by_id[data['team']] + '</a> in <a href="' + key + 'ui/round/' + data['submissions'][i]['round'].toString() +
										'">round ' + data['submissions'][i]['round'].toString() + '</a>, targeting <a href="' +
										key + 'ui/team/' + data['submissions'][i]['target'].toString() + '">' +
										teams_by_id[data['submissions'][i]['target']] + '</a> with ' +
										data['submissions'][i]['throw_count'].toString() + ' ' + throw_str + '<br/>');
								}

								update_binary_povs();
							}
						}
					});
				}
			});
		}
	});
}

function get_ref_binary_html(ref_bin, ref_patches) {
	var pov_html = '<h5>PoV against reference binary</h5><table><tbody>';
	var target = [ref_bin, null].toString();
	if (typeof pov_results[target] === "undefined") {
		pov_html += '<tr><div><a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a></div></tr>';
		if (pov_queue.indexOf(ref_bin) == -1)
			request_pov_result(ref_bin);
	} else if (pov_results[target]['vulnerable']) {
		pov_html += '<tr><div><span class="alert label">Vulnerable: Type ' + pov_results[target]['pov_type'].toString() + '</span> ' +
			'<a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a>, ' +
			'Exec ' + pov_results[target]['execution'] + ', ' +
			pov_results[target]['cpu'].toString() + ' instructions</div></tr>';
	} else if (pov_results[target]['pov_type'] == 0) {
		pov_html += '<tr><div><span class="label">Invalid</span> ' +
			'<a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a>, ' +
			'Exec ' + pov_results[target]['execution'] + ', ' +
			pov_results[target]['cpu'].toString() + ' instructions</div></tr>';
	} else {
		pov_html += '<tr><div><span class="success label">Defended: Type ' + pov_results[target]['pov_type'].toString() + '</span> ' +
			'<a href="' + key + 'ui/binset/' + ref_bin.toString() +
			'">Reference binary ' + ref_bin.toString() + '</a>, ' +
			'Exec ' + pov_results[target]['execution'] + ', ' +
			pov_results[target]['cpu'].toString() + ' instructions</div></tr>';
	}
	pov_html += "</tbody></table>";

	pov_html += '<h5>PoV against reference patches</h5><table><tbody>';
	for (var i = 0; i < ref_patches.length; i++) {
		var bsid = ref_patches[i];
		var patch_target = [bsid, null];
		if (typeof pov_results[patch_target] === "undefined") {
			pov_html += '<tr><div><a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a></div></tr>';
			if (pov_queue.indexOf(bsid) == -1)
				request_pov_result(bsid);
		} else if (pov_results[patch_target]['vulnerable']) {
			pov_html += '<tr><div><span class="alert label">Vulnerable: Type ' + pov_results[patch_target]['pov_type'].toString() + '</span> ' +
				'<a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a>, ' +
				'Exec ' + pov_results[patch_target]['execution'] + ', ' +
				pov_results[patch_target]['cpu'].toString() + ' instructions</div></tr>';
		} else if (pov_results[patch_target]['pov_type'] == 0){
			pov_html += '<tr><div><span class="label">Invalid</span> ' +
				'<a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a>, ' +
				'Exec ' + pov_results[patch_target]['execution'] + ', ' +
				pov_results[patch_target]['cpu'].toString() + ' instructions</div></tr>';
		} else {
			pov_html += '<tr><div><span class="success label">Defended: Type ' + pov_results[patch_target]['pov_type'].toString() + '</span> ' +
				'<a href="' + key + 'ui/binset/' + bsid.toString() +
				'">Patch binary ' + bsid.toString() + '</a>, ' +
				'Exec ' + pov_results[patch_target]['execution'] + ', ' +
				pov_results[patch_target]['cpu'].toString() + ' instructions</div></tr>';
		}
	}
	pov_html += "</tbody></table>";
	return pov_html;
}

function render_binary_povs(data, ids_data, teams, ref_bin, ref_patches) {
	want_fast_pov_update = false;

	var pov_html = get_ref_binary_html(ref_bin, ref_patches);

	pov_html += '<h5>PoV against replacement binaries</h5><table><thead><tr><th>Round</th>';
	var team_cols = [];
	var rcs = [];
	var ids = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		pov_html += '<th><a href="' + key + 'ui/team/' + teams['teams'][i]['id'].toString() + '">' +
			teams['teams'][i]['name'] + '</a></th>';
		team_cols.push(teams['teams'][i]['id']);
		rcs[teams['teams'][i]['id']] = [];
		ids[teams['teams'][i]['id']] = [];
	}
	pov_html += '</tr></thead><tbody>';

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
		pov_html += '<tr><td valign="top"><a href="' + key + 'ui/round/' + rounds[i].toString() + '">' + rounds[i].toString() + '</a></td>';
		for (var j = 0; j < team_cols.length; j++) {
			pov_html += '<td>';
			if (rcs[team_cols[j]][rounds[i]].length == 0) {
				pov_html += "<small><i>None</i></small>";
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
					if ((typeof pov_results[target] === "undefined") || (typeof pov_results[target_noids] === "undefined")) {
						pov_html += bin_html;
						if (pov_queue.indexOf(target) == -1)
							request_pov_result(bsid, idsid);
					} else if (pov_results[target]['vulnerable']) {
						pov_html += bin_html + 'Exec ' + pov_results[target]['execution'] + '<br/>' +
							'<small>' + pov_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="alert label">Vulnerable: Type ' + pov_results[target]['pov_type'].toString() + '</span></div>';
					} else if (pov_results[target]['pov_type'] == 0) {
						pov_html += bin_html + 'Exec ' + pov_results[target]['execution'] + '<br/>' +
							'<small>' + pov_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="label">Invalid</span></div>';
					} else if (pov_results[target_noids]['vulnerable']) {
						pov_html += bin_html + 'Exec ' + pov_results[target]['execution'] + '<br/>' +
							'<small>' + pov_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="label">IDS Blocked: Type ' + pov_results[target]['pov_type'].toString() + '</span></div>';
					} else {
						pov_html += bin_html + 'Exec ' + pov_results[target]['execution'] + '<br/>' +
							'<small>' + pov_results[target]['cpu'] + ' instrs</small>' +
							'<br/><span class="success label">Defended: Type ' + pov_results[target]['pov_type'].toString() + '</span></div>';
					}
				}
			}
			pov_html += '</td>';
		}
		pov_html += '</tr>';
	}

	pov_html += '</tbody></table>';

	$('#bin-list').html(pov_html);
}

function update_binary_povs() {
	$.ajax({
		url: key + "cs/" + pov_info['csid'].toString() + "/active/rcs",
		success: function(data) {
			$.ajax({
				url: key + "cs/" + pov_info['csid'].toString() + "/active/ids",
				success: function(ids_data) {
					$.ajax({
						url: key + "team",
						success: function(teams) {
							$.ajax({
								url: key + "cs/" + pov_info['csid'].toString(),
								success: function(cs_info) {
									$.ajax({
										url: key + "cs/" + pov_info['csid'].toString() + "/refpatch",
										success: function(cs_patches) {
											render_binary_povs(data, ids_data, teams, cs_info['bsid'], cs_patches['bsid']);
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

function request_pov_result(bsid, idsid) {
	var target = [bsid, idsid].toString();

	if (pov_queue.length > 8) {
		pov_queue_wait.push(target);
		return;
	}

	$.ajax({
		url: key + "pov/" + active_povid.toString() + "/result/" + bsid.toString() + "/replay",
		success: function (data) {
			$.ajax({
				url: key + "exec/" + data['execution'].toString() + "/perf",
				success: function (perf) {
					if (idsid == null) {
						if (pov_queue.indexOf(target) != -1) {
							pov_queue.splice(pov_queue.indexOf(target), 1);
						}

						pov_results[target] = data;
						pov_results[target]['cpu'] = perf['cpu'];
						want_fast_pov_update = true;

						if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
							request_pov_result(pov_queue_wait.pop());
						}
					} else {
						$.ajax({
							url: key + "pov/" + active_povid.toString() + "/idsresult/" + bsid.toString() + "/" +
								idsid.toString() + "/replay",
							success: function (idsdata) {
								$.ajax({
									url: key + "exec/" + idsdata['execution'].toString() + "/perf",
									success: function (idsperf) {
										if (pov_queue.indexOf(target) != -1) {
											pov_queue.splice(pov_queue.indexOf(target), 1);
										}

										var target_no_ids = [bsid, null].toString();
										pov_results[target_no_ids] = data;
										pov_results[target_no_ids]['cpu'] = perf['cpu'];
										pov_results[target] = idsdata;
										pov_results[target]['cpu'] = idsperf['cpu'];
										want_fast_pov_update = true;

										if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
											request_pov_result(pov_queue_wait.pop());
										}
									},
									error: function() {
										if (pov_queue.indexOf(target) != -1) {
											pov_queue.splice(pov_queue.indexOf(target), 1);
										}
										if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
											request_pov_result(pov_queue_wait.pop());
										}
									}
								});
							},
							error: function() {
								if (pov_queue.indexOf(target) != -1) {
									pov_queue.splice(pov_queue.indexOf(target), 1);
								}
								if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
									request_pov_result(pov_queue_wait.pop());
								}
							}
						});
					}
				},
				error: function() {
					if (pov_queue.indexOf(target) != -1) {
						pov_queue.splice(pov_queue.indexOf(target), 1);
					}
					if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
						request_pov_result(pov_queue_wait.pop());
					}
				}
			});
		},
		error: function() {
			if (pov_queue.indexOf(target) != -1) {
				pov_queue.splice(pov_queue.indexOf(target), 1);
			}
			if ((pov_queue_wait.length > 0) && (pov_queue.length < 8)) {
				request_pov_result(pov_queue_wait.pop());
			}
		}
	});
}

function update() {
	update_pov_info();
	setTimeout(update, 10000);
}

function fast_update() {
	if (want_fast_pov_update) {
		update_binary_povs();
	}
	setTimeout(fast_update, 200);
}

function initial_update(povid) {
	active_povid = povid;
	update();
	fast_update();
}
