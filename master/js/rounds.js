active_round_num = null;
max_round = null;

document.onkeydown = hotkey;

function hotkey(e) {
	e = e || window.event;

	if (e.keyCode == '37' || e.keyCode == '72')
	{
		//Left
		console.log(active_round_num);
		if (active_round_num == 0)
			activate_round(max_round-1);
		else
			activate_round(active_round_num-1);
	} else if (e.keyCode == '39' || e.keyCode == '76')
	{
		//Right
		if (active_round_num == max_round - 1)
			activate_round(0);
		else
			activate_round(active_round_num+1);
	} else if (e.keyCode == '74')
	{
		// 'j', down vim bindings
		window.scrollBy(0,49);
	} else if (e.keyCode == '75')
	{
		// 'k', up in vim bindings
		window.scrollBy(0,-49);
	} else if (e.keyCode == '71')
	{
		// 'g', go in vim bindings,
		window.scrollTo(0,0);
	} else if (e.keyCode == '83')
	{
		// 's', load status
		window.location('/ui/status');
	}
}

$(document).ready(function() {
	$(window).unload(function() {
		window.history.replaceState({}, '', key + 'ui/round/'+active_round_num)
	});
});

function update_round_list() {
	$.ajax({
		url: key + "complete",
		success: function(data) {
			$("#round-list").html('');
			max_round = data['rounds'].length;
			for (var i = 0; i < max_round; i++) {
				var cls = "button";
				if (data['rounds'][i] == active_round_num)
					cls = "alert button";
				$("#round-list").append('<a class="' + cls + '" href="javascript:activate_round(' +
					data['rounds'][i].toString() + ')">' + data['rounds'][i].toString() + '</a>');
			}

			if ((data['rounds'].length > 0) && (active_round_num == null)) {
				activate_round(data['rounds'][data['rounds'].length - 1]);
			}
		}
	});
}

function activate_round(round_num) {
	update_scores(round_num, function () {
		active_round_num = round_num;
		update_round_list();
		update_active_challenges();
	});
}

function update_active_challenges() {
	$.ajax({
		url: key + "score/" + active_round_num.toString(),
		success: function(data) {
			$("#challenge-list").html('');
			$("#team-list").html('');

			var cb_list = [];
			var cb_list_ids = {};
			var team_list = [];
			var team_id = [];
			var cb_scores = {};
			var team_scores = {};
			var cb_display_names = {};
			var cb_tags = {};

			for (var i = 0; i < data.length; i++) {
				if (team_list.indexOf(data[i]['name']) == -1) {
					team_list.push(data[i]['name']);
					team_id[data[i]['name']] = data[i]['id'];
				}

				for (var j = 0; j < data[i]['submissions'].length; j++) {
					if (cb_list.indexOf(data[i]['submissions'][j]['cset']) == -1) {
						cb_list.push(data[i]['submissions'][j]['cset'])
						cb_list_ids[data[i]['submissions'][j]['cset']] = data[i]['submissions'][j]['cset_id'];
						cb_display_names[data[i]['submissions'][j]['cset']] = data[i]['submissions'][j]['cset_display_name'];
						cb_tags[data[i]['submissions'][j]['cset']] = data[i]['submissions'][j]['cset_tags'];
					}

					if (!cb_scores.hasOwnProperty(data[i]['submissions'][j]['cset']))
						cb_scores[data[i]['submissions'][j]['cset']] = {};
					cb_scores[data[i]['submissions'][j]['cset']][data[i]['name']] = data[i]['submissions'][j];

					if (!team_scores.hasOwnProperty(data[i]['name']))
						team_scores[data[i]['name']] = {};
					team_scores[data[i]['name']][data[i]['submissions'][j]['cset']] = data[i]['submissions'][j];
				}
			}

			cb_list.sort();
			team_list.sort();

			var left_html = '';
			var right_html = '';

			for (var i = 0; i < cb_list.length; i++) {
				var cb_html = '<div class="callout"><h4><a href="' + key + 'ui/cs/' + cb_list_ids[cb_list[i]].toString() + '">' + cb_display_names[cb_list[i]] + '</a></h4>';
				cb_html += '<p>' + cb_list[i] + ' ';
				for (var j = 0; j < cb_tags[cb_list[i]].length; j++) {
					cb_html += '<span class="label">' + cb_tags[cb_list[i]] + '</span>';
				}
				cb_html += '</p>';
				cb_html += '<table><thead><tr><th width="100">Team</th><th width="100">Binary</th><th width="100">IDS</th><th width="70">Score</th><th width="100%"></th></thead><tbody>';

				for (var j = 0; j < team_list.length; j++) {
					cb_html += '<tr><td><a href="' + key + 'ui/team/' + team_id[team_list[j]].toString() + '">' + team_list[j] + '</a></td>';

					if ((cb_scores[cb_list[i]][team_list[j]]['bsid'] != cb_scores[cb_list[i]][team_list[j]]['orig_bsid']) &&
						(cb_scores[cb_list[i]][team_list[j]]['idsid'] != null)) {
						cb_html += '<td><a href="' + key + 'ui/binset/' + cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() +
							'/' + cb_scores[cb_list[i]][team_list[j]]['idsid'].toString() + '">' +
							cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() + "</a></td>";
						cb_html += '<td><a href="' + key + 'ui/binset/' + cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() +
							'/' + cb_scores[cb_list[i]][team_list[j]]['idsid'].toString() + '">' +
							cb_scores[cb_list[i]][team_list[j]]['idsid'].toString() + "</a></td>";
					} else {
						if (cb_scores[cb_list[i]][team_list[j]]['bsid'] == cb_scores[cb_list[i]][team_list[j]]['orig_bsid']) {
							cb_html += '<td><a href="' + key + 'ui/binset/' + cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() +
								'">Original</a></td>';
						} else {
							cb_html += '<td><a href="' + key + 'ui/binset/' + cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() +
								'">' + cb_scores[cb_list[i]][team_list[j]]['bsid'].toString() + "</a></td>";
						}

						if (cb_scores[cb_list[i]][team_list[j]]['idsid'] == null) {
							cb_html += '<td><small>None</small></td>';
						} else {
							cb_html += '<td><a href="' + key + 'ui/ids/' + cb_scores[cb_list[i]][team_list[j]]['idsid'].toString() +
								'">' + cb_scores[cb_list[i]][team_list[j]]['idsid'].toString() + "</a></td>";
						}
					}

					cb_html += "<td>" + Math.trunc(cb_scores[cb_list[i]][team_list[j]]['total'] * 100.0).toString() + "</td>";

					cb_html += "<td>";
					if (cb_scores[cb_list[i]][team_list[j]]['pending']) {
						if (cb_scores[cb_list[i]][team_list[j]]['pending_reason'] == 'rcs')
							cb_html += '<span class="warning label">Patch</span>';
						else if (cb_scores[cb_list[i]][team_list[j]]['pending_reason'] == 'ids')
							cb_html += '<span class="warning label">IDS</span>';
						else if (cb_scores[cb_list[i]][team_list[j]]['pending_reason'] == 'both')
							cb_html += '<span class="warning label">Both</span>';
						else
							cb_html += '<span class="warning label">Down</span>';
					} else if (cb_scores[cb_list[i]][team_list[j]]['total'] == 0) {
						if (cb_scores[cb_list[i]][team_list[j]]['availability']['func']['total'] == 0)
							cb_html += '<span class="alert label">Func</span>';
						if (cb_scores[cb_list[i]][team_list[j]]['availability']['perf']['total'] == 0)
							cb_html += '<span class="alert label">Perf</span>';
					} else {
						cb_html += '<div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
							cb_scores[cb_list[i]][team_list[j]]['total'].toString() +
							'" aria-valuemin="0" aria-valuemax="4"><div class="progress-meter" style="width: ' +
							(cb_scores[cb_list[i]][team_list[j]]['total'] * 25.0).toString() + '%"' +
							'</div></div>';
					}
					cb_html += "</td></tr>";
				}

				cb_html += '</tbody></table></div>';

				if ((i & 1) != 0) {
					right_html = cb_html;
					$("#challenge-list").append('<div class="row"><div class="large-6 columns">' + left_html +
						'</div><div class="large-6 columns">' + right_html + '</div></div>');

					left_html = '';
					right_html = '';
				} else {
					left_html = cb_html;
				}
			}

			if (left_html.length > 0) {
				$("#challenge-list").append('<div class="row"><div class="large-6 columns">' + left_html +
					'</div><div class="large-6 columns">' + right_html + '</div></div>');
			}

			left_html = '';
			right_html = '';

			for (var i = 0; i < team_list.length; i++) {
				var cb_html = '<div class="callout"><h4><a href="' + key + 'ui/team/' + team_id[team_list[i]].toString() +
				 	'">' + team_list[i] + '</a></h4>';
				cb_html += '<table><thead><tr><th width="100">Challenge</th><th width="100">Binary</th><th width="100">IDS</th><th width="70">Score</th><th width="100%"></th></thead><tbody>';

				for (var j = 0; j < cb_list.length; j++) {
					cb_html += '<tr><td><a href="' + key + 'ui/cs/' + cb_list_ids[cb_list[j]].toString() + '">' + cb_display_names[cb_list[j]] + "</a></td>";

					if ((team_scores[team_list[i]][cb_list[j]]['bsid'] != team_scores[team_list[i]][cb_list[j]]['orig_bsid']) &&
						(team_scores[team_list[i]][cb_list[j]]['idsid'] != null)) {
						cb_html += '<td><a href="' + key + 'ui/binset/' + team_scores[team_list[i]][cb_list[j]]['bsid'].toString() +
							'/' + team_scores[team_list[i]][cb_list[j]]['idsid'].toString() + '">' +
							team_scores[team_list[i]][cb_list[j]]['bsid'].toString() + "</a></td>";
						cb_html += '<td><a href="' + key + 'ui/binset/' + team_scores[team_list[i]][cb_list[j]]['bsid'].toString() +
							'/' + team_scores[team_list[i]][cb_list[j]]['idsid'].toString() + '">' +
							team_scores[team_list[i]][cb_list[j]]['idsid'].toString() + "</a></td>";
					} else {
						if (team_scores[team_list[i]][cb_list[j]]['bsid'] == team_scores[team_list[i]][cb_list[j]]['orig_bsid']) {
							cb_html += '<td><a href="' + key + 'ui/binset/' + team_scores[team_list[i]][cb_list[j]]['bsid'].toString() +
								'">Original</a></td>';
						} else {
							cb_html += '<td><a href="' + key + 'ui/binset/' + team_scores[team_list[i]][cb_list[j]]['bsid'].toString() +
								'">' + team_scores[team_list[i]][cb_list[j]]['bsid'].toString() + "</a></td>";
						}

						if (team_scores[team_list[i]][cb_list[j]]['idsid'] == null) {
							cb_html += '<td><small>None</small></td>';
						} else {
							cb_html += '<td><a href="' + key + 'ui/ids/' + team_scores[team_list[i]][cb_list[j]]['idsid'].toString() +
								'">' + team_scores[team_list[i]][cb_list[j]]['idsid'].toString() + "</a></td>";
						}
					}

					cb_html += "<td>" + Math.trunc(team_scores[team_list[i]][cb_list[j]]['total'] * 100.0).toString() + "</td>";

					cb_html += "<td>";
					if (team_scores[team_list[i]][cb_list[j]]['pending']) {
						if (team_scores[team_list[i]][cb_list[j]]['pending_reason'] == 'rcs')
							cb_html += '<span class="warning label">Patch</span>';
						else if (team_scores[team_list[i]][cb_list[j]]['pending_reason'] == 'ids')
							cb_html += '<span class="warning label">IDS</span>';
						else if (team_scores[team_list[i]][cb_list[j]]['pending_reason'] == 'both')
							cb_html += '<span class="warning label">Both</span>';
						else
							cb_html += '<span class="warning label">Down</span>';
					} else if (team_scores[team_list[i]][cb_list[j]]['total'] == 0) {
						if (team_scores[team_list[i]][cb_list[j]]['availability']['func']['total'] == 0)
							cb_html += '<span class="alert label">Func</span>';
						if (team_scores[team_list[i]][cb_list[j]]['availability']['perf']['total'] == 0)
							cb_html += '<span class="alert label">Perf</span>';
					} else {
						cb_html += '<div class="progress" role="progressbar" tabindex="0" aria-valuenow="' +
							team_scores[team_list[i]][cb_list[j]]['total'].toString() +
							'" aria-valuemin="0" aria-valuemax="4"><div class="progress-meter" style="width: ' +
							(team_scores[team_list[i]][cb_list[j]]['total'] * 25.0).toString() + '%"' +
							'</div></div>';
					}
					cb_html += "</td></tr>";
				}

				cb_html += '</tbody></table></div>';

				if ((i & 1) != 0) {
					right_html = cb_html;
					$("#team-list").append('<div class="row"><div class="large-6 columns">' + left_html +
						'</div><div class="large-6 columns">' + right_html + '</div></div>');

					left_html = '';
					right_html = '';
				} else {
					left_html = cb_html;
				}
			}

			if (left_html.length > 0) {
				$("#team-list").append('<div class="row"><div class="large-6 columns">' + left_html +
					'</div><div class="large-6 columns">' + right_html + '</div></div>');
			}
		}
	});
}

function update() {
	update_round_list();

	setTimeout(update, 10000);
}

function initial_update(round_num) {
	if (round_num != null)
	{
		active_round_num = round_num;
		activate_round(round_num);
	}
	update();
}
