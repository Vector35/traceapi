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

def active_pov(url, round_num, pov_list):
	api = trace_api.TraceAPI(url)

	round_num = int(round_num)

	povs = []
	for pov in pov_list:
		povs.append(int(pov))

	result = api.post("active/pov", {"round": round_num, "povsub": povs})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 9:
		print "Expected API URL, round number, PoV submission list"
		exit(1)

	result = active_pov(sys.argv[1], sys.argv[2], sys.argv[3:])
	print json.dumps(result)

