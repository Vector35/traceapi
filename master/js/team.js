active_team = null;
active_team_info = null;
active_tag = null;

function update_team_info() {
	$.ajax({
		url: key + "team/" + active_team.toString(),
		success: function(data) {
			$("#team-name").html(data['name']);

			$.ajax({
				url: key + "complete/last",
				success: function (round_data) {
					if (!round_data['complete'])
						return;

					$.ajax({
						url: key + "rank/" + round_data['round'].toString(),
						success: function (rank_data) {
							var rank = null;
							var score = null;
							for (var i = 0; i < rank_data['rank'].length; i++) {
								if (rank_data['rank'][i].team == active_team) {
									rank = i + 1;
									score = rank_data['rank'][i].score;
								}
							}
							if (rank == null)
								return;

							var rank_name;
							if (rank == 1)
								rank_name = "1st";
							else if (rank == 2)
								rank_name = "2nd";
							else if (rank == 3)
								rank_name = "3rd";
							else
								rank_name = rank.toString() + "th";
							$("#team-info").html("Currently in " + rank_name + " with " + score.toString() + " points.");

							active_team_info = data;
							active_team_info['rank'] = rank;
							active_team_info['score'] = score;

							if (rank == 1)
								active_team_info['relative_to'] = rank_data['rank'][1].team;
							else
								active_team_info['relative_to'] = rank_data['rank'][0].team;

							update_round_list();
						}
					});
				}
			});
		}
	});
}

function update_round_list() {
	$.ajax({
		url: key + "team/" + active_team.toString() + "/score",
		success: function(data) {
			$.ajax({
				url: key + "team/" + active_team_info['relative_to'].toString() + "/score",
				success: function(rel_data) {
					var max_score = data['scores'][data['scores'].length - 1].score;

					$("#round-score-total-list").html('');
					for (var i = data['scores'].length - 1; i >= 0; i--) {
						var rank = data['scores'][i].rank;
						var rank_name;
						if (rank == 1)
							rank_name = "1st";
						else if (rank == 2)
							rank_name = "2nd";
						else if (rank == 3)
							rank_name = "3rd";
						else
							rank_name = rank.toString() + "th";

						$("#round-score-total-list").append('<tr><td width="120"><a href="' + key + 'ui/round/' +
							data['scores'][i].round.toString() + '">Round ' + data['scores'][i].round.toString() + '</a></td>' +
							'<td width="70">' + rank_name + '</td>' +
							'<td width="70">' + data['scores'][i].score.toString() + '</td>' +
							'<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' + data['scores'][i].score.toString() +
							'" aria-valuemin="0" aria-valuemax="' + max_score.toString() + '">' +
							'<div class="progress-meter" style="width: ' + (data['scores'][i].score * 100.0 / max_score).toString() + '%"' +
							'</div></div></td></tr>');
					}

					if (active_team_info['rank'] == 1)
						$("#round-score-relative-name").html("Relative to 2nd place");
					else
						$("#round-score-relative-name").html("Relative to leader");

					var max_rel_score = 0;
					for (var i = data['scores'].length - 1; i >= 0; i--) {
						if (i >= rel_data['scores'].length)
							continue;
						var rel;
						if (i == 0) {
							rel = data['scores'][i].score - rel_data['scores'][i].score;
						} else {
							rel = (data['scores'][i].score - data['scores'][i - 1].score) -
								(rel_data['scores'][i].score - rel_data['scores'][i - 1].score);
						}
						if (rel < 0)
							rel = -rel;
						if (rel > max_rel_score)
							max_rel_score = rel;
					}

					$("#round-score-relative-list").html('');
					for (var i = data['scores'].length - 1; i >= 0; i--) {
						if (i >= rel_data['scores'].length)
							continue;

						var rel;
						if (i == 0) {
							rel = data['scores'][i].score - rel_data['scores'][i].score;
						} else {
							rel = (data['scores'][i].score - data['scores'][i - 1].score) -
								(rel_data['scores'][i].score - rel_data['scores'][i - 1].score);
						}

						var neg_rel = 0;
						var pos_rel = 0;
						if (rel > 0) {
							pos_rel = rel;
							rel_str = "+" + rel.toString();
						} else {
							neg_rel = -rel;
							rel_str = rel.toString();
						}

						var rank = data['scores'][i].rank;
						var rank_name;
						if (rank == 1)
							rank_name = "1st";
						else if (rank == 2)
							rank_name = "2nd";
						else if (rank == 3)
							rank_name = "3rd";
						else
							rank_name = rank.toString() + "th";

						$("#round-score-relative-list").append('<tr><td width="120"><a href="' + key + 'ui/round/' +
							data['scores'][i].round.toString() + '">Round ' + data['scores'][i].round.toString() + '</a></td>' +
							'<td width="70">' + rank_name + '</td>' +
							'<td><div class="alert progress" role="progressbar" tabindex="0" aria-valuenow="' + data['scores'][i].score.toString() +
							'" aria-valuemin="0" aria-valuemax="' + max_rel_score.toString() + '">' +
							'<div class="progress-meter" style="margin-left: ' + (100 - (neg_rel * 100.0 / max_rel_score)).toString() +
							'%; width: ' + (neg_rel * 100.0 / max_rel_score).toString() + '%"' +
							'</div></div>' + '<td width="70" align="right">' + rel_str + '</td>' +
							'<td><div class="success progress" role="progressbar" tabindex="0" aria-valuenow="' + data['scores'][i].score.toString() +
							'" aria-valuemin="0" aria-valuemax="' + max_rel_score.toString() + '">' +
							'<div class="progress-meter" style="width: ' + (pos_rel * 100.0 / max_rel_score).toString() + '%"' +
							'</div></div></td></tr>');
					}

					update_challenge_list();
				}
			});
		}
	});
}

function get_score_col_html(col_count, value, visible_value, max_value, percent, highlight) {
	return '<td width="' + Math.trunc(100.0 / col_count).toString() + '%">' +
		'<table style="border-collapse: separate; margin-bottom: 0"><tbody style="background: transparent">' +
		'<td width="60%" style="padding: 0">' +
		'<div class="' + (highlight ? 'alert ': '') + 'progress" role="progressbar" tabindex="0" aria-valuenow="' + value.toString() +
		'" aria-valuemin="0" aria-valuemax="' + max_value.toString() + '">' +
		'<div class="progress-meter" style="width: ' + percent.toString() + '%"' +
		'</div></div></td><td style="padding: 0 0 0 0.4em">' +
		visible_value.toString() + '</td></tr></table></td>';
}

function get_single_stat_html(scores, cs_names, comparison, renderer) {
	score_html = '';
	cs_order = [];
	for (var csid in scores[active_team]) {
		cs_order.push(csid);
	}
	cs_order.sort(function (a, b) {
		var diff = comparison(a, b);
		if (diff != 0)
			return diff;
		if (cs_names[a] < cs_names[b])
			return -1;
		if (cs_names[a] > cs_names[b])
			return 1;
		return 0;
	});
	for (var i = 0; i < cs_order.length; i++) {
		var csid = cs_order[i];
		score_html += '<tr><td width="120"><a href="' + key + 'ui/cs/' + csid.toString() + '">' + cs_names[csid] + '</a></td>';
		score_html += renderer(scores[active_team][csid], true);

		for (var team in scores) {
			if (team == active_team)
				continue;
			if (!(csid in scores[team])) {
				score_html += '<td></td>';
				continue;
			}

			score_html += renderer(scores[team][csid], false);
		}

		score_html += '</tr>';
	}
	return score_html;
}

function filter_changed() {
	active_tag = $("#challenge-tags").val();
	if (active_tag == "")
		active_tag = null;
	update();
}

function update_challenge_list() {
	$.ajax({
		url: key + "score/summary",
		success: function(data) {
			var scores = [];
			var team_names = [];
			var cs_names = [];
			var tag_list = [];
			for (var i = 0; i < data['scores'].length; i++) {
				if (!(data['scores'][i].team in scores)) {
					scores[data['scores'][i].team] = [];
					team_names[data['scores'][i].team] = data['scores'][i].team_name;
				}

				if (!(data['scores'][i].csid in cs_names)) {
					cs_names[data['scores'][i].csid] = data['scores'][i].cs_display_name;
				}

				scores[data['scores'][i].team][data['scores'][i].csid] = data['scores'][i];

				for (var j = 0; j < data['scores'][i].cs_tag_list.length; j++) {
					var tag = data['scores'][i].cs_tag_list[j];
					var found = false;
					for (var k = 0; k < tag_list.length; k++) {
						if (tag_list[k] == tag) {
							found = true;
							break;
						}
					}
					if (!found) {
						tag_list.push(tag);
					}
				}
			}

			if (!(active_team in scores))
				return;

			tag_list.sort();
			if (active_tag == null)
				tag_html = '<option selected value="">All</option>';
			else
				tag_html = '<option value="">All</option>';
			for (var i = 0; i < tag_list.length; i++) {
				if (active_tag == tag_list[i])
					tag_html += '<option selected value="' + tag_list[i] + '">' + tag_list[i] + '</option>';
				else
					tag_html += '<option value="' + tag_list[i] + '">' + tag_list[i] + '</option>';
			}
			$("#challenge-tags").html(tag_html);

			var score_html = '';
			cs_order = [];
			for (var csid in scores[active_team]) {
				cs_order.push(csid);
			}
			cs_order.sort(function (a, b) {
				if (cs_names[a] < cs_names[b])
					return -1;
				if (cs_names[a] > cs_names[b])
					return 1;
				return 0;
			});
			for (var i = 0; i < cs_order.length; i++) {
				var csid = cs_order[i];

				if (active_tag != null) {
					var found = false;
					var tags = scores[active_team][csid].cs_tag_list;
					for (var j = 0; j < tags.length; j++) {
						if (tags[j] == active_tag) {
							found = true;
							break;
						}
					}
					if (!found)
						continue;
				}

				score_html += '<tr><td width="120"><a href="' + key + 'ui/cs/' + csid.toString() + '">' + cs_names[csid] + '</a></td>';

				score_html += get_score_col_html(6, scores[active_team][csid].total,
					Math.trunc(scores[active_team][csid].total * 100.0), 4,
					scores[active_team][csid].total * 25.0, false);
				score_html += get_score_col_html(6, scores[active_team][csid].func,
					Math.trunc(scores[active_team][csid].func * 1000.0) / 1000.0, 1,
					scores[active_team][csid].func * 100.0, false);
				score_html += get_score_col_html(6, scores[active_team][csid].perf,
					Math.trunc(scores[active_team][csid].perf * 1000.0) / 1000.0, 1,
					scores[active_team][csid].perf * 100.0, false);
				score_html += get_score_col_html(6, scores[active_team][csid].security - 1,
					Math.trunc(scores[active_team][csid].security * 1000.0) / 1000.0, 1,
					(scores[active_team][csid].security - 1) * 100.0, false);
				score_html += get_score_col_html(6, scores[active_team][csid].eval - 1,
					Math.trunc(scores[active_team][csid].eval * 1000.0) / 1000.0, 1,
					(scores[active_team][csid].eval - 1) * 100.0, false);
				score_html += get_score_col_html(6, scores[active_team][csid].uptime / scores[active_team][csid].rounds,
					Math.trunc((scores[active_team][csid].uptime / scores[active_team][csid].rounds) * 100.0).toString() + "%", 1,
					(scores[active_team][csid].uptime / scores[active_team][csid].rounds) * 100.0, false);

				score_html += '</tr>';
			}
			$("#challenge-summary-list").html(score_html);

			var header_html = '<td>Challenge</td><td><i>' + team_names[active_team] + '</i></td>';
			var team_count = 1;
			for (var team in scores) {
				if (team == active_team)
					continue;
				header_html += '<td><a href="' + key + 'ui/team/' + team.toString() + '">' + team_names[team] + '</a></td>';
				team_count++;
			}
			$("#challenge-total-header").html(header_html);
			$("#challenge-func-header").html(header_html);
			$("#challenge-perf-header").html(header_html);
			$("#challenge-security-header").html(header_html);
			$("#challenge-eval-header").html(header_html);
			$("#challenge-uptime-header").html(header_html);

			$("#challenge-total-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) { return scores[active_team][b].total - scores[active_team][a].total; },
				function (score, highlight) {
					return get_score_col_html(team_count, score.total, Math.trunc(score.total * 100.0), 4,
						score.total * 25.0, highlight);
				}));

			$("#challenge-func-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) { return scores[active_team][b].func - scores[active_team][a].func; },
				function (score, highlight) {
					return get_score_col_html(team_count, score.func, Math.trunc(score.func * 1000.0) / 1000.0, 1,
						score.func * 100.0, highlight);
				}));

			$("#challenge-perf-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) { return scores[active_team][b].perf - scores[active_team][a].perf; },
				function (score, highlight) {
					return get_score_col_html(team_count, score.perf, Math.trunc(score.perf * 1000.0) / 1000.0, 1,
						score.perf * 100.0, highlight);
				}));

			$("#challenge-security-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) { return scores[active_team][b].security - scores[active_team][a].security; },
				function (score, highlight) {
					return get_score_col_html(team_count, score.security - 1, Math.trunc(score.security * 1000.0) / 1000.0, 1,
						(score.security - 1) * 100.0, highlight);
				}));

			$("#challenge-eval-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) { return scores[active_team][b].eval - scores[active_team][a].eval; },
				function (score, highlight) {
					return get_score_col_html(team_count, score.eval - 1, Math.trunc(score.eval * 1000.0) / 1000.0, 1,
						(score.eval - 1) * 100.0, highlight);
				}));

			$("#challenge-uptime-list").html(get_single_stat_html(scores, cs_names,
				function (a, b) {
					return (scores[active_team][b].uptime / scores[active_team][b].rounds) -
						(scores[active_team][a].uptime / scores[active_team][a].rounds);
				},
				function (score, highlight) {
					return get_score_col_html(team_count, score.uptime / score.rounds,
						Math.trunc((score.uptime / score.rounds) * 100.0).toString() + "%", 1,
						(score.uptime / score.rounds) * 100.0, highlight);
				}));
		}
	});
}

function update() {
	update_team_info();
	setTimeout(update, 10000);
}

function initial_update(team) {
	active_team = team;
	update();
}
