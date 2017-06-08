archived_stories_visible = false;
edits_active = 0;
state_names = ["potential stories", "under investigation", "ready for visualization", "story finder review", "ready for production", "archived"];
priority_names = ["Critical", "High", "Medium", "Low"];
tempvar = 0;
story_filter = null;

//document.onkeydown = hotkey;

/* Stories disabled.
function hotkey(e) {
	e = e || window.event;
	if (e.keyCode == '71')
	{
		// "g" -- goto specific story
		story = parseInt(window.prompt("Enter Story ID:","0"));
		if (story != 0) {
			if (document.location.hash) {
				old_story = parseInt(document.location.hash.slice(1));
				if (old_story > 0) {
					$("#story" + old_story.toString()).removeClass("expanded");
				}
			}
			document.location.hash = "#" + story.toString();
			document.load_story = story;
			update_story_list();
		}
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
*/

function update_queue_status() {
	$.ajax({
		url: key + "status/work",
		success: function(data) {
			$("#interactive-queue").html(data["interactive"].toString());
			$("#priority-queue").html(data["priority"].toString());
			$("#background-queue").html(data["normal"].toString());
			$("#pending-queue").html(data["pending"].toString());
			$("#waiting-queue").html(data["waiting"].toString());

			update_round_number();
		}
	});
}

function update_round_number() {
	$.ajax({
		url: key + "complete/last",
		success: function (data) {
			round_num = data['round'];
			if (data['complete']) {
				$("#round-num").html("Round " + round_num.toString());
				update_scores(round_num, function() {});
			} else {
				$("#round-num").html("Not started");
				$("#score-list").html('');
			}

			update_story_round();

			update_story_list();
		}
	});
}

/*j
function update_story_round() {
	$.ajax({
		url: key + "complete/autoanalysis/storygen",
		success: function (data) {
			if (data['complete']) {
				$("#story-round").html("(up to round " + data['round'].toString() + ")");
			} else {
				$("#story-round").html("(not processed yet)")
			}
		}
	});
}

function set_story_state(story_id, state) {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/state",
		type: 'POST',
		data: JSON.stringify({"state": state}),
		contentType: 'application/json',
		success: function (data) {
			update_story_list();
		}
	});
}

function show_story(story_id, is_update) {
	is_update = is_update || false;
	$.ajax({
		ifModified: is_update, //Bail if a cached result
		url: key + "story/" + story_id.toString(),
		success: function (data,text,jqxhr) {
			if (data)  //Bailing still calls this, have to test here too
			{
				var story_html = '<td><a href="javascript:hide_story(' + story_id.toString() + ')">';
				story_html += '<small>[' + story_id.toString() + ']</small> ' + data['title'] + '</a>';
				story_html += '<p><small>Created by: ' + data['creator'] + '</small><br>';
				story_html += '<small>Story finder: ' + data['owner'] + '</small><br>';
				story_html += '<small>Visualizer: ' + data['visualizer'] + '</small><br>';
				if (data['create_time'] == data['edit_time']) {
					story_html += '<small>Added ' + (new Date(data['create_time'])).toLocaleTimeString() + '</small></p>';
				} else {
					story_html += '<small>Added ' + (new Date(data['create_time'])).toLocaleTimeString() + ', edited ' +
						(new Date(data['edit_time'])).toLocaleTimeString() + ' (<a href="/ui/story/' +
						story_id.toString() + '/history">history</a>)</small></p>';
				}
				story_html += '<div class="callout">';

				story_html += '<div id="story' + story_id.toString() + '-view">';
				story_html += convert_markdown(data['description']);
				story_html += '</div>';

				story_html += '<div id="story' + story_id.toString() + '-edit" style="display: none">';
				story_html += 'Title: <input type="text" id="story' + story_id.toString() + '-title">';
				story_html += 'Story Finder: <input type="text" id="story' + story_id.toString() + '-owner">';
				story_html += 'Visualizer: <input type="text" id="story' + story_id.toString() + '-visualizer">';
				story_html += '<div class="row"><div class="large-6 columns">';
				story_html += '<a href="/ui/markdown">Markdown</a>: ';
				story_html += '<textarea id="story' + story_id.toString() + '-contents" rows="10"></textarea>';
				story_html += '<a class="tiny round button" href="javascript:insert_video(' + story_id.toString() + ')">Video</a> ';
				story_html += '<a class="tiny round button" data-open="upload-page" href="javascript:image_story=' + story_id.toString() + '; $(\'#upload\').val(\'\');">Image</a> ';
				story_html += '<a class="tiny round button" href="javascript:bold_text(' + story_id.toString() + ')">Bold</a> ';
				story_html += '<a class="tiny round button" href="javascript:italics_text(' + story_id.toString() + ')">Italics</a> ';
				story_html += '<a class="tiny round button" href="javascript:heading_text(' + story_id.toString() + ')">Heading</a> ';
				story_html += '</div><div class="large-6 columns">';
				story_html += 'Preview: <div class="callout" id="story' + story_id.toString() + '-preview">';
				story_html += convert_markdown(data['description']);
				story_html += '</div></div></div>';

				story_html += 'Priority: <select id="story' + story_id.toString() + '-priority">';
				for (var i = 0; i < 4; i++) {
					if (data['priority'] == i) {
						story_html += '<option value="' + i.toString() + '" selected="selected">' + priority_names[i] + '</option>';
					} else {
						story_html += '<option value="' + i.toString() + '">' + priority_names[i] + '</option>';
					}
				}
				story_html += '</select>';

				story_html += '<p align="right">';
				story_html += '<a class="alert small button" href="javascript:cancel_edit_story(' +
					story_id.toString() + ')">Cancel</a> ';
				story_html += '<a class="success small button" href="javascript:accept_edit_story(' +
					story_id.toString() + ')">Accept</a></p>';
				story_html += '</div>';

				story_html += '<p align="right" id="story' + story_id.toString() + '-actions">';

				story_html += '<a class="small button" href="javascript:edit_story(' +
					story_id.toString() + ')">Edit</a> ';
				if (data['state'] == 5) {
					story_html += '<a class="small button" href="javascript:set_story_state(' +
						story_id.toString() + ', 0)">Unarchive</a> ';
				} else {
					story_html += '<a class="alert small button" href="javascript:set_story_state(' +
						story_id.toString() + ', 5)">Archive</a> ';
					if (data['state'] < 4) {
						story_html += '<a class="small button" href="javascript:set_story_state(' +
							story_id.toString() + ', ' + (data['state'] + 1).toString() + ')">Promote (' +
							state_names[data['state'] + 1] + ')</a> ';
					}
					if (data['state'] > 0) {
						story_html += '<a class="small button" href="javascript:set_story_state(' +
							story_id.toString() + ', ' + (data['state'] - 1).toString() + ')">Demote (' +
							state_names[data['state'] - 1] + ')</a> ';
					}
				}
				story_html += '<a class="success small button" href="javascript:new_comment(' +
					story_id.toString() + ')">Comment</a> ';
				story_html += '</p>';

				for (var i = 0; i < data['comments'].length; i++) {
					story_html += '<hr><div id="comment' + data['comments'][i]['id'].toString() + '-view"><p>';
					story_html += '<small>From ' + data['comments'][i]['owner'] + ' ';
					if (data['comments'][i]['create_time'] == data['comments'][i]['edit_time']) {
						story_html += ' at ' + (new Date(data['comments'][i]['create_time'])).toLocaleTimeString() +
							'</small></p>';
					} else {
						story_html += ' at ' + (new Date(data['comments'][i]['create_time'])).toLocaleTimeString() +
							', edited ' + (new Date(data['comments'][i]['edit_time'])).toLocaleTimeString() +
							' (<a href="/ui/story/' + story_id.toString() + '/comment/' + data['comments'][i]['id'].toString() +
							'/history">history</a>)</small></p>';
					}
					story_html += convert_markdown(data['comments'][i]['contents']);
					story_html += '<p align="right">';
					story_html += '<a class="small button" href="javascript:edit_comment(' +
						story_id.toString() + ', ' + data['comments'][i]['id'].toString() + ')">Edit</a> ';
					story_html += '<a class="alert small button" href="javascript:delete_comment(' +
						story_id.toString() + ', ' + data['comments'][i]['id'].toString() + ')">Delete</a>';
					story_html += '</p></div>';
					story_html += '<div id="comment' + data['comments'][i]['id'].toString() + '-edit" style="display: none">';
					story_html += '<div class="row"><div class="large-6 columns">';
					story_html += '<a href="/ui/markdown">Markdown</a>: ';
					story_html += '<textarea id="comment' + data['comments'][i]['id'].toString() + '-contents" rows="10"></textarea>';
					story_html += '</div><div class="large-6 columns">';
					story_html += 'Preview: <div class="callout" id="comment' + data['comments'][i]['id'].toString() + '-preview">';
					story_html += convert_markdown(data['comments'][i]['contents']);
					story_html += '</div></div></div>';
					story_html += '<p align="right"><a class="alert small button" href="javascript:cancel_edit_comment(' +
						story_id.toString() + ', ' + data['comments'][i]['id'].toString() + ')">Cancel</a> ';
					story_html += '<a class="success small button" href="javascript:accept_edit_comment(' +
						story_id.toString() + ', ' + data['comments'][i]['id'].toString() + ')">Accept</a></p>';
					story_html += '</div>';
				}

				story_html += '<div id="story' + story_id.toString() + '-new-comment" style="display: none">';
				story_html += '<hr>';
				story_html += '<div class="row"><div class="large-6 columns">';
				story_html += 'New comment (<a href="/ui/markdown">Markdown</a>): ';
				story_html += '<textarea id="story' + story_id.toString() + '-new-comment-contents" rows="10"></textarea>';
				story_html += '</div><div class="large-6 columns">';
				story_html += 'Preview: <div class="callout" id="story' + story_id.toString() + '-new-comment-preview">';
				story_html += '</div></div></div>';
				story_html += '<p align="right"><a class="alert small button" href="javascript:cancel_new_comment(' +
					story_id.toString() + ')">Cancel</a> ';
				story_html += '<a class="success small button" href="javascript:accept_new_comment(' +
					story_id.toString() + ')">Accept</a></p>';
				story_html += '</div>';

				story_html += '</div></td>';
				$("#story" + story_id.toString()).html(story_html);
				$("#story" + story_id.toString()).addClass("expanded");

				$("#story" + story_id.toString() + "-title").val(data['title']);
				$("#story" + story_id.toString() + "-owner").val(data['owner']);
				$("#story" + story_id.toString() + "-visualizer").val(data['visualizer']);
				$("#story" + story_id.toString() + "-contents").val(data['description']);
				$("#story" + story_id.toString() + "-contents").on('input propertychange', function() {
					preview_edit_story(story_id);
				});

				$("#story" + story_id.toString() + "-new-comment-contents").on('input propertychange', function() {
					preview_new_comment(story_id);
				});

				for (var i = 0; i < data['comments'].length; i++) {
					$("#comment" + data['comments'][i]['id'].toString() + "-contents").val(data['comments'][i]['contents']);
					var comment_id = data['comments'][i]['id'];
					$("#comment" + data['comments'][i]['id'].toString() + "-contents").on('input propertychange', function() {
						preview_edit_comment(comment_id);
					});
				}
			}
		}
	});
}

function current_selection(element) {
	var startPos = element.selectionStart;
	var endPos = element.selectionEnd;

 //	Not sure what the right usability tweak is.
 //	while (element.value[endPos-1] == " " && endPos >= startPos) endPos--;
 //	while (element.value[startPos] == " " && endPos >= startPos) startPos++;

	return element.value.substring(element.selectionStart,element.selectionEnd);
}

function insert_text(element,text) {
	if (element.selectionStart || element.selectionEnd == 0) {
		var startPos = element.selectionStart;
		var endPos = element.selectionEnd;
		element.value = element.value.substring(0, startPos)
			+ text
			+ element.value.substring(endPos, element.value.length);
	} else {
		element.value += text;
	}
}

function bold_text(story_id) {
	if (story_id == 0) {
		textarea = $("#new-story-contents")[0];
	} else {
		textarea = $("#story" + story_id.toString() + "-contents")[0];
	}
	insert_text(textarea,"**"+current_selection(textarea)+"**");
	preview_edit_story(story_id);
}

function italics_text(story_id) {
	if (story_id == 0) {
		textarea = $("#new-story-contents")[0];
	} else {
		textarea = $("#story" + story_id.toString() + "-contents")[0];
	}
	insert_text(textarea,"*"+current_selection(textarea)+"*");
	preview_edit_story(story_id);
}

function heading_text(story_id) {
	if (story_id == 0) {
		textarea = $("#new-story-contents")[0];
	} else {
		textarea = $("#story" + story_id.toString() + "-contents")[0];
	}
	insert_text(textarea,"# "+current_selection(textarea));
	preview_edit_story(story_id);
}

function show_video(random_id,video_host,video_path) {
	if (document.location.hostname == "127.0.0.1" || document.location.hostname == "localhost") {
		host = "localhost";
		port = "80"+video_host.split(".")[0].substr(-1)+"4";
	} else {
		host = video_host;
		port = "8004";
	}
	video_url = "http://" + host + ":" + port + video_path;

	if ((window.navigator.userAgent.match("CrOS") != null) || (window.navigator.platform == "MacIntel" && window.navigator.vendor == "Google Inc."))
	{
		//ChromeBooks
		video_text = '<object id="' + random_id + '" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" codebase="http://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=10,0,45,2" width="800" > <param name="allowFullscreen" value="true"> <param name="allowScriptAccess" value="always"> <param name="movie" value="/js/JarisFLVPlayer.swf"> <param name="bgcolor" value="#000000"> <param name="quality" value="high"> <param name="scale" value="noscale"> <param name="wmode" value="opaque"> <param name="flashvars" value="source=' + video_url + '&type=video&streamtype=http&autostart=false&hardwarescaling=false&darkcolor=000000&brightcolor=4c4c4c&controlcolor=FFFFFF&hovercolor=67A8C1&buffertime=1&controltype=1"> <param name="seamlesstabbing" value="false"> <embed type="application/x-shockwave-flash" pluginspage="http://www.adobe.com/shockwave/download/index.cgi?P1_Prod_Version=ShockwaveFlash" width="800" height="450" src="/js/JarisFLVPlayer.swf" allowfullscreen="true" allowscriptaccess="always" bgcolor="#000000" quality="high" scale="noscale" wmode="opaque" flashvars="source=' + video_url + '&type=video&streamtype=http&autostart=false&hardwarescaling=false&darkcolor=000000&brightcolor=4c4c4c&controlcolor=FFFFFF&hovercolor=67A8C1&buffertime=1&controltype=1" seamlesstabbing="false" > <noembed> </noembed> </embed> </object>';
	} else {
		video_text = '<video width="800" controls="" preload="metadata">';
		video_text += '<source src="' + video_url + '" type="video/mp4">';
		video_text += 'Your browser does not support video.</video>\n';
	}
	video_text += '<br/><a download="" href="' + video_url + '">Download Video</a>';

	if($('#'+random_id).parents(".large-6").length == 0) {
		$('#'+random_id).html(video_text);
	}
}

function insert_video(story_id) {
	if (document.location.hostname == "127.0.0.1" || document.location.hostname == "localhost") {
		host = "localhost";
	} else {
		host = "va-cgc-0";
	}
	if (story_id == 0) {
		textarea = $("#new-story-contents")[0];
	} else {
		textarea = $("#story" + story_id.toString() + "-contents")[0];
	}
	//$("#video-prompt").foundation('open');
	video_id = window.prompt("Video ID: ");
	$.ajax({
		type: 'GET',
		url: 'http://' + host + ':8003/vgs/VideoInfo/' + video_id.toString(),
		success: function(video_info)
		{
			if (video_info["ready"]) {
				video_host = video_info["workerIp"];
				video_path = "/GetVideo/" + video_info["eventSessionId"] + "/" + video_id + "/";
				video_path += video_info["videoFilename"];
				video_text = "\n![Video " + video_id + "](video:" + video_host + ":" + video_path + ")";
				insert_text(textarea,video_text);
				preview_edit_story(story_id);
			} else {
				alert("Invalid Video ID");
			}
		}});
}

function get_collapsed_story_html(story_id, data) {
	var story_html = '<td><div class="row"><div class="large-10 column">';
	story_html += '<a href="javascript:show_story(' + story_id.toString() + ')">';
	story_html += '<small>[' + story_id.toString() + ']</small> ' + data['title'] + '</a></div>';
	story_html += '<div class="large-2 column">';
	story_html += '<span class="arrows"><a href="javascript:story_up(' + story_id.toString() + ');">&uarr;</a>&nbsp;';
	story_html += '<a href="javascript:story_down(' + story_id.toString() + ');">&darr;</a></span>';
	if (data['priority'] == 0)
		story_html += '<span class="alert label" align="right">Critical</span>';
	else if (data['priority'] == 1)
		story_html += '<span class="warning label" align="right">High</span>';
	else if (data['priority'] == 2)
		story_html += '<span class="success label" align="right">Medium</span>';
	else
		story_html += '<span class="label" align="right">Low</span>';
	story_html += '</div></td>';
	return story_html;
}

function hide_story(story_id) {
	$.ajax({
		url: key + "story/" + story_id.toString(),
		success: function (data) {
			var story_html = get_collapsed_story_html(story_id, data);
			$("#story" + story_id.toString()).html(story_html);
			$("#story" + story_id.toString()).removeClass("expanded");
		}
	});
}

function story_down(story_id) {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/down",
		success: function (data) {
			update_story_list();
		}
	});
}

function story_up(story_id) {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/up",
		success: function (data) {
			update_story_list();
		}
	});
}

function video_playing() {
	for (var i=0; i<$('video').length; i++)
		if (($('video')[i].paused == false) || ($('video')[i].seeking == true))
			return true;
	for (var i=0; i<$('object').length; i++)
	{
		id = $('object')[i].id;
		player = new JarisFLVPlayer(id);
		if (player.isPlaying())
			return true;
	}

	return false;
}

function filter_story(story) {
	if (story_filter == 'production')
		return story['state'] == 4;
	if (story_filter == 'visualization')
		return story['state'] == 2;
	if (story_filter == 'owned')
		return story['owner'] == Cookies.get("user") || story['visualizer'] == Cookies.get("user");
	return true;
}

function update_story_list() {
	if (edits_active > 0 || video_playing())
		return;

	$.ajax({
		url: key + "story",
		success: function (data) {
			var stories = {};
			var storyList = [];
			for (var i = 0; i < 6; i++) {
				$("#story-list-state" + i.toString()).children().each(function () {
					stories[this.id] = $(this);
					storyList.push($(this));
				});
			}
			for (var i = 0; i < storyList.length; i++)
				storyList[i].detach();

			for (var i = 0; i < data['list'].length; i++) {
				if (!filter_story(data['list'][i]))
					continue;
				if (stories.hasOwnProperty("story" + data['list'][i]['id'])) {
					var story = stories["story" + data['list'][i]['id'].toString()];
					story.appendTo("#story-list-state" + data['list'][i]['state'].toString());
					if (story.hasClass("expanded"))
						show_story(data['list'][i]['id'], true);
				} else {
					var story_html = '<tr id="story' + data['list'][i]['id'].toString() + '">';
					story_html += get_collapsed_story_html(data['list'][i]['id'], data['list'][i]);
					story_html += '</tr>';
					$("#story-list-state" + data['list'][i]['state'].toString()).append(story_html);

					stories["story" + data['list'][i]['id'].toString()] = $('#story' + data['list'][i]['id'].toString());
				}
			}

			if (archived_stories_visible) {
				$("#archived-stories").attr('style', 'display: inline');
				$("#archive-toggle").html('<a href="javascript:hide_archived()">(Hide)</a>');
			} else {
				$("#archived-stories").attr('style', 'display: none');
				$("#archive-toggle").html('<a href="javascript:show_archived()">(Show)</a>');
			}

			for (var i = 0; i < 6; i++) {
				if ((i == 0) && ((story_filter == null) || (story_filter == "none")))
					continue;
				if ($("#story-list-state" + i.toString()).children().length == 0) {
					$("#story-state" + i.toString()).attr('style', 'display: none');
				} else {
					$("#story-state" + i.toString()).attr('style', 'display: inline');
				}
			}
			if (document.load_story > 0) {
				var story_id = document.load_story
				show_story(story_id);
				$('html, body').animate({scrollTop: $("#story" + story_id).offset().top}, 500);
				document.load_story = 0;
			}
		}
	});
}

function hide_archived() {
	archived_stories_visible = false;
	update_story_list();
}

function show_archived() {
	archived_stories_visible = true;
	update_story_list();
}

function edit_story(story_id) {
	$("#story" + story_id.toString() + "-view").attr('style', 'display: none');
	$("#story" + story_id.toString() + "-actions").attr('style', 'display: none');
	$("#story" + story_id.toString() + "-edit").attr('style', 'display: inline');
	$("#story" + story_id.toString() + "-contents").on('drag dragstart dragend dragover dragenter dragleave drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
	});
	$("#story" + story_id.toString() + "-contents").on('drop', function (event) {
		upload_file(story_id, event.originalEvent.dataTransfer.files[0]);
	});
	edits_active++;
}

function cancel_edit_story(story_id) {
	$("#story" + story_id.toString() + "-view").attr('style', 'display: inline');
	$("#story" + story_id.toString() + "-actions").attr('style', 'display: inline');
	$("#story" + story_id.toString() + "-edit").attr('style', 'display: none');
	edits_active--;
	show_story(story_id);
}

function preview_edit_story(story_id) {
	if (story_id == 0) {
		$("#new-story-preview").html(convert_markdown($("#new-story-contents").val()));
	} else {
		$("#story" + story_id.toString() + "-preview").html(convert_markdown($("#story" + story_id.toString() + "-contents").val()));
	}
}

function accept_edit_story(story_id) {
	var title = $("#story" + story_id.toString() + "-title").val();
	var owner = $("#story" + story_id.toString() + "-owner").val();
	var visualizer = $("#story" + story_id.toString() + "-visualizer").val();
	var desc = $("#story" + story_id.toString() + "-contents").val();
	var priority = parseInt($("#story" + story_id.toString() + "-priority").val());

	$.ajax({
		url: key + "story/" + story_id.toString(),
		type: 'POST',
		data: JSON.stringify({"title": title, "description": desc, "owner": owner, "visualizer": visualizer}),
		contentType: 'application/json',
		success: function (data) {
			$.ajax({
				url: key + "story/" + story_id.toString() + "/priority",
				type: 'POST',
				data: JSON.stringify({"priority": priority}),
				contentType: 'application/json',
				success: function (data) {
					$("#story" + story_id.toString() + "-view").attr('style', 'display: inline');
					$("#story" + story_id.toString() + "-actions").attr('style', 'display: inline');
					$("#story" + story_id.toString() + "-edit").attr('style', 'display: none');
					edits_active--;
					show_story(story_id);
					update_story_list();
				}
			});
		}
	});
}

function new_comment(story_id) {
	var user = Cookies.get("user");
	if (typeof user == "undefined") {
		$("#login-page").foundation('open');
		return;
	}

	$("#story" + story_id.toString() + "-new-comment").attr('style', 'display: inline');
	$("#story" + story_id.toString() + "-new-comment-contents").val("");
	$("#story" + story_id.toString() + "-new-comment-preview").html("");
	edits_active++;
}

function preview_new_comment(story_id) {
	$("#story" + story_id.toString() + "-new-comment-preview").html(convert_markdown($("#story" + story_id.toString() +
		"-new-comment-contents").val()));
}

function cancel_new_comment(story_id) {
	$("#story" + story_id.toString() + "-new-comment").attr('style', 'display: none');
	edits_active--;
}

function accept_new_comment(story_id) {
	var user = Cookies.get("user");
	var contents = $("#story" + story_id.toString() + "-new-comment-contents").val();

	if (typeof user == "undefined") {
		$("#login-page").foundation('open');
		return;
	}

	$.ajax({
		url: key + "story/" + story_id.toString() + "/comment",
		type: 'POST',
		data: JSON.stringify({"owner": user, "contents": contents}),
		contentType: 'application/json',
		success: function (data) {
			$("#story" + story_id.toString() + "-new-comment").attr('style', 'display: none');
			edits_active--;
			show_story(story_id);
		}
	});
}

function edit_comment(story_id, comment_id) {
	$("#comment" + comment_id.toString() + "-view").attr('style', 'display: none');
	$("#comment" + comment_id.toString() + "-edit").attr('style', 'display: inline');
	edits_active++;
}

function preview_edit_comment(comment_id) {
	$("#comment" + comment_id.toString() + "-preview").html(convert_markdown($("#comment" + comment_id.toString() + "-contents").val()));
}

function cancel_edit_comment(story_id, comment_id) {
	$("#comment" + comment_id.toString() + "-view").attr('style', 'display: inline');
	$("#comment" + comment_id.toString() + "-edit").attr('style', 'display: none');
	edits_active--;
	show_story(story_id);
}

function accept_edit_comment(story_id, comment_id) {
	var contents = $("#comment" + comment_id.toString() + "-contents").val();

	$.ajax({
		url: key + "story/" + story_id.toString() + "/comment/" + comment_id.toString(),
		type: 'POST',
		data: JSON.stringify({"contents": contents}),
		contentType: 'application/json',
		success: function (data) {
			$("#comment" + comment_id.toString() + "-view").attr('style', 'display: inline');
			$("#comment" + comment_id.toString() + "-edit").attr('style', 'display: none');
			edits_active--;
			show_story(story_id);
		}
	});
}

function delete_comment(story_id, comment_id) {
	$.ajax({
		url: key + "story/" + story_id.toString() + "/comment/" + comment_id.toString() + "/delete",
		type: 'POST',
		success: function (data) {
			show_story(story_id);
		}
	});
}

function create_new_story() {
	var user = Cookies.get("user");
	if (typeof user == "undefined") {
		$("#login-page").foundation('open');
		return;
	}

	$("#new-story-title").val("");
	$("#new-story-owner").val("");
	$("#new-story-visualizer").val("");
	$("#new-story-contents").val("");
	$("#new-story-preview").html("");
	$("#new-story-priority").val("2");

	$("#new-story").attr('style', 'display: block');
	edits_active++;
}

function preview_new_story() {
	$("#new-story-preview").html(convert_markdown($("#new-story-contents").val()));
}

function cancel_new_story() {
	$("#new-story").attr('style', 'display: none');
	edits_active--;
}

function accept_new_story() {
	var user = Cookies.get("user");
	var title = $("#new-story-title").val();
	var owner = $("#new-story-owner").val();
	var visualizer = $("#new-story-visualizer").val();
	var contents = $("#new-story-contents").val();
	var priority = parseInt($("#new-story-priority").val());

	if (typeof user == "undefined") {
		$("#login-page").foundation('open');
		return;
	}

	$.ajax({
		url: key + "story",
		type: 'POST',
		data: JSON.stringify({"title": title, "description": contents, "creator": user, "owner": owner, "visualizer": visualizer, "priority": priority, "state": 1}),
		contentType: 'application/json',
		success: function (data) {
			$("#new-story").attr('style', 'display: none');
			edits_active--;
			update_story_list();
		}
	});
}
*/
function update() {
	update_queue_status();

	setTimeout(update, 10000);
}

update();

/*
$("#new-story-contents").on('input propertychange', function() {
	preview_new_story();
});

function set_filter(filter_type) {
	story_filter = filter_type;
	$("#filter").html('<a class="' + (((story_filter == null) || (story_filter == 'none')) ? 'alert ' : '') + 'small button" href="' + key + 'ui/status">All stories</a> ' +
		'<a class="' + ((story_filter == 'production') ? 'alert ' : '') + 'small button" href="' + key + 'ui/status/production">Production</a> ' +
		'<a class="' + ((story_filter == 'visualization') ? 'alert ' : '') + 'small button" href="' + key + 'ui/status/visualization">Visualization</a> ' +
		'<a class="' + ((story_filter == 'owned') ? 'alert ' : '') + 'small button" href="' + key + 'ui/status/owned">Owned</a>')
}

function upload_file(story_id, file) {
	var reader = new FileReader();
	var textarea = $("#story" + story_id.toString() + "-contents")[0];
	reader.onloadend = function() {
		var bytes = new Uint8Array(reader.result);
		var binary = '';
		var len = bytes.byteLength;
		for (var i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		var contents = window.btoa(binary);

		$.ajax({
			type: 'POST',
			data: JSON.stringify({"contents": contents, "name": file.name}),
			contentType: 'application/json',
			url: key + 'upload',
			success: function(data)
			{
				$('#upload-page').triggerHandler('close.zf.trigger', []);

				var text = '![Uploaded image](' + key + 'upload/data/' + data['hash'] + '/' + encodeURIComponent(data['name']) + ')';
				insert_text(textarea, text);
				preview_edit_story(story_id);
			}});
	};
	reader.readAsArrayBuffer(file);
}

$("input[type=file]").on('change', function (event) {
	upload_file(image_story, event.target.files[0]);
});

$(document).ready(function() {
	if (document.location.hash != "")
	{
		document.load_story = parseInt(document.location.hash.slice(1));
	}
});
*/
