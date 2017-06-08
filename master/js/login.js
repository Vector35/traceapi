function update_login() {
	if (typeof Cookies.get("user") == "undefined")
		$("#login").html('<a data-open="login-page">Active user: None</a>');
	else
		$("#login").html('<a data-open="login-page">Active user: ' + Cookies.get("user") + '</a>');
}

function accept_login() {
	if ($("#login-name").val().length == 0)
		Cookies.remove("user");
	else
		Cookies.set("user", $("#login-name").val());
	update_login();
}

update_login();
