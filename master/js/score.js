function update_scores(round_num, done) {
	$.ajax({
		url: key + "rank/" + round_num.toString(),
		success: function (data) {
			var max_score = data['rank'][0]['score'];

			$("#score-list").html('');
			for (var i = 0; i < data['rank'].length; i++) {
				$("#score-list").append('<tr><td width="120"><a href="' + key + 'ui/team/' + data['rank'][i].team.toString() + '">' +
					data['rank'][i].name + '</a></td>' + '<td width="70">' + data['rank'][i].score.toString() + '</td>' +
					'<td><div class="progress" role="progressbar" tabindex="0" aria-valuenow="' + data['rank'][i].score.toString() +
					'" aria-valuemin="0" aria-valuemax="' + max_score.toString() + '">' +
					'<div class="progress-meter" style="width: ' + (data['rank'][i].score * 100.0 / max_score).toString() + '%"' +
					'</div></div></td></tr>');
			}

			done();
		}
	});
}
