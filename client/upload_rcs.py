#!/usr/bin/env python
import trace_api
import sys
import base64
import json

def getint(s):
	try:
		return int(s)
	except:
		return None

def upload_rcs(url, team_name, cs_name, round_num, bin_paths):
	api = trace_api.TraceAPI(url)

	team_id = getint(team_name)
	if team_id is None:
		team_id = api.team_id(team_name)
	if team_id is None:
		print "Team not found"
		return None

	cs_id = getint(cs_name)
	if cs_id is None:
		cs_id = api.cs_id(cs_name)
	if cs_id is None:
		print "CS not found"
		return None

	binaries = []
	for path in bin_paths:
		data = open(path, 'rb').read()
		binaries.append(base64.b64encode(data))

	result = api.post("binset", {"binaries": binaries})
	if not result["ok"]:
		print json.dumps(result)
		return None
	binary = result["bsid"]

	result = api.post("rcs", {"team": team_id, "csid": cs_id, "round": int(round_num), "bsid": binary})
	if not result["ok"]:
		print json.dumps(result)
		return None

	return {"ok": True, "bsid": binary, "rcsid": result["rcsid"]}

if __name__ == "__main__":
	if len(sys.argv) < 6:
		print "Expected API URL, team name, CS name, round number, and binary list"
		exit(1)

	result = upload_rcs(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
	if result is None:
		exit(1)
	print json.dumps(result)

