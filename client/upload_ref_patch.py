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

def upload_ref_patch(url, cs_name, bin_paths):
	api = trace_api.TraceAPI(url)

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

	result = api.post("refpatch", {"csid": cs_id, "bsid": binary, "full": True})
	if not result["ok"]:
		print json.dumps(result)
		return None

	return {"ok": True, "bsid": binary, "id": result["id"]}

if __name__ == "__main__":
	if len(sys.argv) < 4:
		print "Expected API URL, CS name, and binary list"
		exit(1)

	result = upload_ref_patch(sys.argv[1], sys.argv[2], sys.argv[3:])
	print json.dumps(result)

