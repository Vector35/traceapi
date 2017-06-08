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

def upload_polls(url, cs_name, poll_paths):
	api = trace_api.TraceAPI(url)

	cs_id = getint(cs_name)
	if cs_id is None:
		cs_id = api.cs_id(cs_name)
	if cs_id is None:
		print "CS not found"
		return None

	polls = []
	for path in poll_paths:
		data = open(path, 'rb').read()
		polls.append({"contents": base64.b64encode(data), "seed": None})

	return api.post("poll", {"csid": cs_id, "polls": polls})

if __name__ == "__main__":
	if len(sys.argv) < 5:
		print "Expected API URL, CS name, and poll list"
		exit(1)

	result = upload_polls(sys.argv[1], sys.argv[2], sys.argv[3:])
	if result is None:
		exit(1)
	print json.dumps(result)
