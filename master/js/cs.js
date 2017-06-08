active_csid = null;
cs_info = null;

function update_cs_info() {
	$.ajax({
		url: key + "cs/" + active_csid.toString(),
		success: function(data) {
			$.ajax({
				url: key + "cs/" + active_csid.toString() + "/refpatch",
				success: function(ref_patches) {
					cs_info = data;

					$("#cs-name").html(cs_info['shortname'] + ' <small>(' + cs_info['name'] + ')</small>');

					var desc_html = '<p>' + cs_info['description'] + '</p>';

					var tag_html = '<p>';
					for (var i = 0; i < data['tags'].length; i++) {
						tag_html += '<span class="label">' + data['tags'][i] + '</span>';
					}
					tag_html += "</p>";

					var download_html = '<p>Download: ';
					var disasm_html = 'Disassemble: ';
					for (var i = 0; i < data['files'].length; i++) {
						if (i > 0) {
							download_html += ", ";
							disasm_html += ", ";
						}
						download_html += '<a href="' + key + 'data/' + data['files'][i] + '">Part ' + (i + 1).toString() + '</a>';
						disasm_html += '<a href="binaryninja:' + window.location.origin.replace(/:/g,'%3a') + key + 'data/' + data['files'][i] + '">Part ' + (i + 1).toString() + '</a>';
					}

					download_html += '<br/>' + disasm_html + '</p>';

					var ref_html = 'Reference binary: <a href="' + key + 'ui/binset/' + data['bsid'].toString() + '">' +
						data['bsid'].toString() + '</a>';

					var patch_html = 'Reference patches: ';
					for (var i = 0; i < ref_patches['bsid'].length; i++) {
						if (i > 0)
							patch_html += ", ";
						patch_html += '<a href="' + key + 'ui/binset/' + ref_patches['bsid'][i].toString() + '">' +
							ref_patches['bsid'][i].toString() + '</a>';
					}

					$("#cs-info").html(desc_html + tag_html + ref_html + '<br/>' + patch_html + '</p>' + download_html);

					$("#cs-readme").html(marked(cs_info['readme'], {smartypants: false, smartLists: false, sanitize: true}));
					update_cs_scores();
				}
			});
		}
	});
}

function render_cs_scores(rcs_data, ids_data, pov_data, teams, score_data) {
	var cs_html = '<table><thead><tr><th>Round</th>';
	var team_cols = [];
	var rcs = [];
	var ids = [];
	var povs = [];
	var scores = [];
	var seen_hashes = [];
	for (var i = 0; i < teams['teams'].length; i++) {
		cs_html += '<th><a href="' + key + 'ui/team/' + teams['teams'][i]['id'].toString() + '">' +
			teams['teams'][i]['name'] + '</a></th>';
		team_cols.push(teams['teams'][i]['id']);
		rcs[teams['teams'][i]['id']] = [];
		ids[teams['teams'][i]['id']] = [];
		povs[teams['teams'][i]['id']] = [];
		seen_hashes[teams['teams'][i]['id']] = [];
		scores[teams['teams'][i]['id']] = [];
	}
	cs_html += '</tr></thead><tbody>';

	var rounds = [];
	for (var i = 0; i < rcs_data['rcs'].length; i++) {
		if (rounds.indexOf(rcs_data['rcs'][i]['round']) == -1)
			rounds.push(rcs_data['rcs'][i]['round']);
	}
	for (var i = 0; i < ids_data['ids'].length; i++) {
		if (rounds.indexOf(ids_data['ids'][i]['round']) == -1)
			rounds.push(ids_data['ids'][i]['round']);
	}
	for (var i = 0; i < pov_data['pov'].length; i++) {
		if (rounds.indexOf(pov_data['pov'][i]['round']) == -1)
			rounds.push(pov_data['pov'][i]['round']);
	}
	for (var i = 0; i < score_data.length; i++) {
		for (var j = 0; j < score_data[i]['scores'].length; j++) {
			if (rounds.indexOf(score_data[i]['scores'][j]['round']) == -1)
				rounds.push(score_data[i]['scores'][j]['round']);
		}
	}

	for (var i = 0; i < team_cols.length; i++) {
		for (var j = 0; j < rounds.length; j++) {
			rcs[team_cols[i]][rounds[j]] = [];
			ids[team_cols[i]][rounds[j]] = null;
			povs[team_cols[i]][rounds[j]] = [];
			seen_hashes[team_cols[i]][rounds[j]] = [];
			scores[team_cols[i]][rounds[j]] = null;
		}
	}

	for (var i = 0; i < rcs_data['rcs'].length; i++) {
		rcs[rcs_data['rcs'][i]['team']][rcs_data['rcs'][i]['round']].push(rcs_data['rcs'][i]);
	}

	for (var i = 0; i < ids_data['ids'].length; i++) {
		ids[ids_data['ids'][i]['team']][ids_data['ids'][i]['round']] = ids_data['ids'][i];
	}

	for (var i = 0; i < pov_data['pov'].length; i++) {
		if (seen_hashes[pov_data['pov'][i]['team']][pov_data['pov'][i]['round']].indexOf(pov_data['pov'][i]['hash']) == -1) {
			povs[pov_data['pov'][i]['team']][pov_data['pov'][i]['round']].push(pov_data['pov'][i]);
			seen_hashes[pov_data['pov'][i]['team']][pov_data['pov'][i]['round']].push(pov_data['pov'][i]['hash']);
		}
	}

	for (var i = 0; i < score_data.length; i++) {
		for (var j = 0; j < score_data[i]['scores'].length; j++) {
			scores[score_data[i]['id']][score_data[i]['scores'][j]['round']] = score_data[i]['scores'][j];
		}
	}

	for (var i = 0; i < rounds.length; i++) {
		cs_html += '<tr><td valign="top"><a href="' + key + 'ui/round/' + rounds[i].toString() + '">' + rounds[i].toString() + '</a></td>';
		for (var j = 0; j < team_cols.length; j++) {
			cs_html += '<td>';
			if (rcs[team_cols[j]][rounds[i]].length == 0) {
				cs_html += "<div><small><i>No replacement binary</i></small></div>";
			} else {
				for (var k = 0; k < rcs[team_cols[j]][rounds[i]].length; k++) {
					var bsid = rcs[team_cols[j]][rounds[i]][k]['bsid'];
					if (bsid == cs_info['bsid']) {
						cs_html += '<div><a href="' + key + 'ui/binset/' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() +
							'">Original binary</a></div>';
					} else {
						if (ids[team_cols[j]][rounds[i]] == null) {
							cs_html += '<div><a href="' + key + 'ui/binset/' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() +
								'">Binary ' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() + '</a></div>';
						} else {
							cs_html += '<div><a href="' + key + 'ui/binset/' + rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() +
								'/' + ids[team_cols[j]][rounds[i]]['idsid'].toString() + '">Binary ' +
								rcs[team_cols[j]][rounds[i]][k]['bsid'].toString() + '</a></div>';
						}
					}
				}
			}
			if (ids[team_cols[j]][rounds[i]] == null) {
				cs_html += "<div><small><i>No IDS</i></small></div>";
			} else if (rcs[team_cols[j]][rounds[i]].length == 1) {
				cs_html += '<div><a href="' + key + 'ui/binset/' + rcs[team_cols[j]][rounds[i]][0]['bsid'].toString() +
					'/' + ids[team_cols[j]][rounds[i]]['idsid'].toString() +
					'">IDS ' + ids[team_cols[j]][rounds[i]]['idsid'].toString() + '</a></div>';
			} else {
				cs_html += '<div><a href="' + key + 'ui/ids/' + ids[team_cols[j]][rounds[i]]['idsid'].toString() +
					'">IDS ' + ids[team_cols[j]][rounds[i]]['idsid'].toString() + '</a></div>';
			}
			if (povs[team_cols[j]][rounds[i]].length == 0) {
				cs_html += "<div><small><i>No PoV</i></small></div>";
			} else {
				for (var k = 0; k < povs[team_cols[j]][rounds[i]].length; k++) {
					var povid = povs[team_cols[j]][rounds[i]][k]['povid'];
					cs_html += '<div><a href="' + key + 'ui/pov/' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() +
							'">PoV ' + povs[team_cols[j]][rounds[i]][k]['povid'].toString() + '</a></div>';
				}
			}
			if (scores[team_cols[j]][rounds[i]] != null) {
				if (scores[team_cols[j]][rounds[i]]['pending']) {
					if (scores[team_cols[j]][rounds[i]]['pending_reason'] == 'rcs')
						cs_html += '<span class="warning label">Down for patch</span>';
					else if (scores[team_cols[j]][rounds[i]]['pending_reason'] == 'ids')
						cs_html += '<span class="warning label">Down for IDS</span>';
					else if (scores[team_cols[j]][rounds[i]]['pending_reason'] == 'both')
						cs_html += '<span class="warning label">Down for patch and IDS</span>';
					else
						cs_html += '<span class="warning label">Down</span>';
				} else {
					cs_html += '<table style="border-collapse: separate"><tbody style="background: transparent">'
					var a = scores[team_cols[j]][rounds[i]]['availability']['total'];
					var s = scores[team_cols[j]][rounds[i]]['security']['total'];
					var e = scores[team_cols[j]][rounds[i]]['evaluation']['total'];
					var total = scores[team_cols[j]][rounds[i]]['total'];
					cs_html += '<tr style="background: transparent">';
					cs_html += '<td width="40%" style="padding: 0"><div class="success progress" role="progressbar" tabindex="0" aria-valuenow="' +
						a.toString() + '" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
						(a * 100.0).toString() + '%"' + '</div></div></td>';
					cs_html += '<td style="padding: 0 0 0 0.4em"><small>Avail</small> ' + (Math.trunc(a * 1000.0) / 1000.0).toString() + "</td></tr>";

					cs_html += '<tr style="background: transparent">';
					cs_html += '<td width="40%" style="padding: 0"><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
						s.toString() + '" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
						((s - 1.0) * 100.0).toString() + '%"' + '</div></div></td>';
					cs_html += '<td style="padding: 0 0 0 0.4em"><small>Sec</small> ' + (Math.trunc(s * 1000.0) / 1000.0).toString() + "</td></tr>";

					cs_html += '<tr style="background: transparent">';
					cs_html += '<td width="40%" style="padding: 0"><div class="alert progress" role="progressbar" tabindex="0" aria-valuenow="' +
						e.toString() + '" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
						((e - 1.0) * 100.0).toString() + '%"' + '</div></div></td>';
					cs_html += '<td style="padding: 0 0 0 0.4em"><small>Eval</small> ' + (Math.trunc(e * 1000.0) / 1000.0).toString() + "</td></tr>";

					cs_html += '<tr style="background: transparent">';
					cs_html += '<td width="40%" style="padding: 0"><div class="warning progress" role="progressbar" tabindex="0" aria-valuenow="' +
						total.toString() + '" aria-valuemin="0" aria-valuemax="1"><div class="progress-meter" style="width: ' +
						(total * 25.0).toString() + '%"' + '</div></div></td>';
					cs_html += '<td style="padding: 0 0 0 0.4em"><small><b>Total</b></small><b> ' + (Math.trunc(total * 100.0)).toString() + "<b></td></tr>";
					cs_html += '</tbody></table>';
				}
			}
			cs_html += '</td>';
		}
		cs_html += '</tr>';
	}

	cs_html += '</tbody></table>';
	$('#cs-score').html(cs_html);
}

function update_cs_scores() {
	$.ajax({
		url: key + "cs/" + active_csid.toString() + "/active/rcs",
		success: function(rcs) {
			$.ajax({
				url: key + "cs/" + active_csid.toString() + "/active/ids",
				success: function(ids) {
					$.ajax({
						url: key + "cs/" + active_csid.toString() + "/active/pov",
						success: function(pov) {
							$.ajax({
								url: key + "team",
								success: function(teams) {
									$.ajax({
										url: key + "cs/" + active_csid.toString() + "/score",
										success: function(scores) {
											render_cs_scores(rcs, ids, pov, teams, scores);
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

function update() {
	update_cs_info();
	setTimeout(update, 10000);
}

function initial_update(csid) {
	active_csid = csid;
	update();
}
