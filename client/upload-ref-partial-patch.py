#!/usr/bin/env python
import trace_api
import sys
import base64
import json

if len(sys.argv) < 4:
	print "Expected API URL, CS name, and binary list"
	exit(1)

api = trace_api.TraceAPI(sys.argv[1])

cs_id = api.cs_id(sys.argv[2])
if cs_id is None:
	print "CS not found"
	exit(1)

binaries = []
for path in sys.argv[3:]:
	data = open(path, 'rb').read()
	binaries.append(base64.b64encode(data))

result = api.post("binset", {"binaries": binaries})
if not result["ok"]:
	print json.dumps(result)
	exit(1)
binary = result["bsid"]

result = api.post("refpatch", {"csid": cs_id, "bsid": binary, "full": False})
if not result["ok"]:
	print json.dumps(result)
	exit(1)

result = {"ok": True, "bsid": binary, "id": result["id"]}
print json.dumps(result)

