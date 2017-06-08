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

def active_rcs(url, round_num, rcs_list):
	api = trace_api.TraceAPI(url)

	round_num = int(round_num)

	rcs = []
	for data in rcs_list:
		team_name = data[0]
		cs_name = data[1]
		bsid = int(data[2])
		pending = data[3]
		reason = data[4]
		if pending == "true" or pending == "True" or pending == True:
			pending = True
		else:
			pending = False

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

		rcs.append({'team': team_id, 'csid': cs_id, 'bsid': bsid, 'pending': pending, 'pending_reason': reason})

	result = api.post("active/rcs", {"round": round_num, "rcs": rcs})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 6:
		print "Expected API URL, round number, and team, CS, binary, and pending list"
		exit(1)

	rcs = []
	for i in xrange(3, len(sys.argv), 5):
		rcs.append([sys.argv[i], sys.argv[i + 1], sys.argv[i + 2], sys.argv[i + 3], sys.argv[i + 4]])

	result = active_pov(sys.argv[1], sys.argv[2], rcs)
	print json.dumps(result)
