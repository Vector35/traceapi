story_id = null;

function show_video(random_id,video_host,video_path) {
	if (document.location.hostname == "127.0.0.1" || document.location.hostname == "localhost") {
		host = "localhost";
		port = "80"+video_host.split(".")[0].substr(-1)+"4";
	} else {
		host = video_host;
		port = "8004";
	}
	video_url = "http://" + host + ":" + port + video_path;
	video_text = '<video width="800" controls="" preload="metadata">';
	video_text += '<source src="' + video_url + '" type="video/mp4">';
	video_text += 'Your browser does not support video.</video>\n';
	video_text += '<br/><a download="" href="' + video_url + '">Download Video</a>';
	if($('#'+random_id).parents(".large-6").length == 0) {
		$('#'+random_id).html(video_text);
	}
}

function convert_markdown(md) {
	var renderer = new marked.Renderer()
	var defaultImageRenderer = renderer.image;
	renderer.image = function(href, title, text) {
		if (href.substr(0, 6) == "video:") {
			var random_id = Math.random().toString(36).substring(10);
			var video_params = href.split(":");
			if (video_params.length < 3)
				return "";
			var video_host = video_params[1];
			var video_path = video_params[2];
			var video_text = '\n<div id="' + random_id + '"></div>\n';
			video_text += '<script>\n';
			video_text += 'show_video("' + random_id + '","' + video_host + '", "' + video_path +'");\n';
			video_text += '</script>';
			return video_text;
		} else {
			return defaultImageRenderer.call(this, href, title, text);
		}
	}
	return marked(md, {smartypants: false, smartLists: false, sanitize: true, renderer: renderer})
}

function update_history() {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/history",
		success: function (data) {
			var story_html = '';

			for (var i = 0; i < data['history'].length; i++) {
				story_html += '<div class="callout">';
				story_html += '<h5>' + data['history'][i]['title'] + '</h5>';
				story_html += '<p><small>At ' + (new Date(data['history'][i]['timestamp'])).toLocaleTimeString() + '</small></p>';
				story_html += '<hr/>';
				story_html += '<div id="html' + i.toString() + '">';
				story_html += convert_markdown(data['history'][i]['description']);
				story_html += '</div>';
				story_html += '<hr/><small>Raw markdown contents:</small><br/>';
				story_html += '<pre id="markdown' + i.toString() + '">';
				story_html += '</pre>';
				story_html += '</div>';
			}

			$("#history-list").html(story_html);

			for (var i = 0; i < data['history'].length; i++)
				$("#markdown" + i.toString()).text(data['history'][i]['description']);
		}
	});
}

function update() {
	update_history();
	setTimeout(update, 10000);
}

function initial_update(story) {
	story_id = story;
	update();
}
