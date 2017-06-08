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

def active_ids(url, round_num, ids_list):
	api = trace_api.TraceAPI(url)

	round_num = int(round_num)

	ids_rules = []
	for ids in ids_list:
		ids_rules.append(int(ids))

	result = api.post("active/ids", {"round": round_num, "idssub": ids_rules})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 9:
		print "Expected API URL, round number, IDS rule submission list"
		exit(1)

	result = active_ids(sys.argv[1], sys.argv[2], sys.argv[3:])
	print json.dumps(result)

