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

def cs_score(url, team_name, round_num, cs_list):
	api = trace_api.TraceAPI(url)

	team_id = getint(team_name)
	if team_id is None:
		team_id = api.team_id(team_name)
	if team_id is None:
		print "Team not found"
		return None

	round_num = int(round_num)

	cs = []
	for score in cs_list:
		cs_name = score[0]
		total = float(score[1])
		avail_score = float(score[2])
		func_score = float(score[3])
		timeout = float(score[4])
		connect_fail = float(score[5])
		perf_score = float(score[6])
		mem = float(score[7])
		cpu = float(score[8])
		file_size = float(score[9])
		security_score = float(score[10])
		eval_score = float(score[11])

		cs_id = getint(cs_name)
		if cs_id is None:
			cs_id = api.cs_id(cs_name)
		if cs_id is None:
			print "CS not found"
			return None

		cs.append({"csid": cs_id, "total": total, "availability": avail_score, "functionality": func_score, "timeout": timeout, "connect_fail": connect_fail, "performance": perf_score, "mem": mem, "cpu": cpu, "file_size": file_size, "security": security_score, "evaluation": eval_score})

	result = api.post("result/cs", {"team": team_id, "round": round_num, "cs": cs})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 13:
		print "Expected API URL, team name, round number, CS list (CS name, total score, availability score, functionality score, timeouts, connect failures, performance score, mem overhead, CPU overhead, file size overhead, security score, evaluation score)"
		exit(1)

	cs = []
	for i in xrange(3, len(sys.argv), 12):
		cs.append([sys.argv[i], sys.argv[i + 1], sys.argv[i + 2], sys.argv[i + 3], sys.argv[i + 4], sys.argv[i + 5], sys.argv[i + 6], sys.argv[i + 7], sys.argv[i + 8], sys.argv[i + 9], sys.argv[i + 10], sys.argv[i + 11]])

	result = cs_score(sys.argv[1], sys.argv[2], cs)
	if result is None:
		exit(1)
	print json.dumps(result)

