#!/usr/bin/env python
import trace_api
import sys
import base64
import json

if len(sys.argv) < 5:
	print "Expected API URL, CS name, round number, and PoVs"
	exit(1)

api = trace_api.TraceAPI(sys.argv[1])

cs_id = api.cs_id(sys.argv[2])
if cs_id is None:
	print "CS not found"
	exit(1)

pov_ids = []
for path in sys.argv[4:]:
	data = open(path, 'rb').read()
	data = base64.b64encode(data)

	result = api.post("pov", {"team": None, "csid": cs_id, "round": int(sys.argv[3]), "target": None, "pov": data})
	if not result["ok"]:
		print json.dumps(result)
		exit(1)

	pov_ids.append(result["povid"])

result = {"ok": True, "povs": pov_ids}
print json.dumps(result)

