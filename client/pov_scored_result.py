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

def pov_scored_result(url, round_num, pov_list):
	api = trace_api.TraceAPI(url)

	round_num = int(round_num)

	povs = []
	for pov in pov_list:
		povid = int(pov[0])
		bsid = int(pov[1])
		throw_index = int(pov[2])
		pov_type = int(pov[3])
		vulnerable = pov[4]
		ts = float(pov[5])
		duration = float(pov[6])
		seed = pov[7]

		if vulnerable == "True" or vulnerable == "true" or vulnerable == True:
			vulnerable = True
		else:
			vulnerable = False

		povs.append({"povsub": povid, "target": bsid, "throw": throw_index, "type": pov_type, "vulnerable": vulnerable, "time": ts, "duration": duration, "seed": seed})

	result = api.post("result/pov", {"round": round_num, "pov": povs})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 11:
		print "Expected API URL, round number, PoV list (PoV submission ID, target binary, throw index, PoV type, vulnerable, start time, duration, seed)"
		exit(1)

	pov = []
	for i in xrange(3, len(sys.argv), 8):
		pov.append([sys.argv[i], sys.argv[i + 1], sys.argv[i + 2], sys.argv[i + 3], sys.argv[i + 4], sys.argv[i + 5], sys.argv[i + 6], sys.argv[i + 7]])

	result = pov_scored_result(sys.argv[1], sys.argv[2], pov)
	print json.dumps(result)

