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

def upload_ref_pov(url, cs_name, pov):
	api = trace_api.TraceAPI(url)

	cs_id = getint(cs_name)
	if cs_id is None:
		cs_id = api.cs_id(cs_name)
	if cs_id is None:
		print "CS not found"
		return None

	path = pov

	data = open(path, 'rb').read()
	data = base64.b64encode(data)

	result = api.post("pov", {"team": None, "csid": cs_id, "round": None, "submissions": [{"target": None}], "throw_count": None, "pov": data})
	return result

if __name__ == "__main__":
	if len(sys.argv) < 8:
		print "Expected API URL, CS name, and PoV"
		exit(1)

	result = upload_ref_pov(sys.argv[1], sys.argv[2], sys.argv[3])
	if result is None:
		exit(1)
	print json.dumps(result)

