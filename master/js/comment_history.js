story_id = null;
comment_id = null;

function update_history() {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/comment/" + comment_id.toString() + "/history",
		success: function (data) {
			var comment_html = '';

			for (var i = 0; i < data['history'].length; i++) {
				comment_html += '<div class="callout">';
				comment_html += '<p><small>At ' + (new Date(data['history'][i]['timestamp'])).toLocaleTimeString() + '</small></p>';
				comment_html += '<hr/>';
				comment_html += '<div id="html' + i.toString() + '">';
				comment_html += marked(data['history'][i]['contents']);
				comment_html += '</div>';
				comment_html += '<hr/><small>Raw markdown contents:</small><br/>';
				comment_html += '<pre id="markdown' + i.toString() + '">';
				comment_html += '</pre>';
				comment_html += '</div>';
			}

			$("#history-list").html(comment_html);

			for (var i = 0; i < data['history'].length; i++)
				$("#markdown" + i.toString()).text(data['history'][i]['contents']);
		}
	});
}

function update() {
	update_history();
	setTimeout(update, 10000);
}

function initial_update(story, comment) {
	story_id = story;
	comment_id = comment;
	update();
}

