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

def upload_pov(url, team_name, cs_name, round_num, throw_count, pov, sub_list):
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

	round_num = int(round_num)
	throw_count = int(throw_count)
	path = pov

	subs = []
	for sub in sub_list:
		target_id = getint(sub)
		if target_id is None:
			target_id = api.team_id(sub)
		if target_id is None:
			print "Team not found"
			return None
		subs.append({"target": target_id})

	data = open(path, 'rb').read()
	data = base64.b64encode(data)

	result = api.post("pov", {"team": team_id, "csid": cs_id, "round": round_num, "submissions": subs, "throw_count": throw_count, "pov": data})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 8:
		print "Expected API URL, team name, CS name, round number, throw count, PoV, and target teams"
		exit(1)

	result = upload_pov(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7:])
	if result is None:
		exit(1)
	print json.dumps(result)

