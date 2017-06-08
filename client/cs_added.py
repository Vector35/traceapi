#!/usr/bin/env python
import trace_api
import sys
import base64
import json

def cs_added(url, cs_name, round_num):
	api = trace_api.TraceAPI(url)

	cs_id = api.cs_id(cs_name)
	if cs_id is None:
		print "CS not found"
		return None

	round_num = int(round_num)

	return api.post("event/csadded", {"csid": cs_id, "round": round_num})

if __name__ == "__main__":
	if len(sys.argv) < 4:
		print "Expected API URL, CS name, round number"
		exit(1)

	result = cs_added(sys.argv[1], sys.argv[2], sys.argv[3])
	if result is None:
		exit(1)
	print json.dumps(result)

